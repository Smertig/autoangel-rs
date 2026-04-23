import type { AutoangelModule } from '../../types/autoangel';

// ── Shared path helpers ──
// These encode Angelica Engine archive path conventions used by both
// the 3D renderer and the dependency collector.

/** Resolve a basename relative to a parent file's directory, lowercased. */
export function resolveRelative(parentPath: string, basename: string): string {
  const dir = parentPath.substring(0, parentPath.lastIndexOf('\\') + 1);
  return (dir + basename).toLowerCase();
}

/**
 * Resolve a file reference that may be absolute (contains `\`) or relative.
 * Absolute paths are just lowercased; relative ones are resolved against parentPath.
 */
export function resolvePath(refPath: string, parentPath: string): string {
  return refPath.includes('\\') ? refPath.toLowerCase() : resolveRelative(parentPath, refPath);
}

/**
 * Build candidate archive paths for a texture referenced by a SKI file.
 * The engine tries three locations in order: textures/ subdir, tex_<skinname>/ subdir, bare.
 */
export function textureCandidates(skiArchivePath: string, texName: string): string[] {
  const skiBasename = skiArchivePath.split('\\').pop()!.replace(/\.ski$/i, '');
  return [
    resolveRelative(skiArchivePath, 'textures\\' + texName),
    resolveRelative(skiArchivePath, 'tex_' + skiBasename + '\\' + texName),
    resolveRelative(skiArchivePath, texName),
  ];
}

/**
 * Merge skin paths from SMD and ECM additional skins into a single deduplicated list.
 * SMD skins are relative to smdPath; ECM additional skins may be absolute or relative to ecmPath.
 */
export function collectSkinPaths(
  smdPath: string,
  smdSkinPaths: string[],
  ecmPath: string,
  ecmAdditionalSkins: string[],
): string[] {
  const paths: string[] = [];
  for (const sp of smdSkinPaths) {
    if (sp) paths.push(resolveRelative(smdPath, sp));
  }
  for (const sp of ecmAdditionalSkins) {
    const resolved = resolvePath(sp, ecmPath);
    if (!paths.includes(resolved)) paths.push(resolved);
  }
  return paths;
}

/**
 * Try to load a SKI file, falling back to a `models\` prefix if the direct path fails.
 * Some archives store skins under models/ but reference them without the prefix.
 */
export async function tryLoadSki(
  skiPath: string,
  getFile: (path: string) => Promise<Uint8Array | null>,
): Promise<{ data: Uint8Array; archivePath: string } | null> {
  let data = await getFile(skiPath);
  if (data) return { data, archivePath: skiPath };
  if (!skiPath.startsWith('models\\')) {
    const withPrefix = 'models\\' + skiPath;
    data = await getFile(withPrefix);
    if (data) return { data, archivePath: withPrefix };
  }
  return null;
}

/**
 * Fallback used when an SMD declares no skins: player-character body models
 * are "headless" because the engine binds them at runtime via Lua
 * (`ECM_ReplaceSkinFile`) based on character composition. The most common
 * naming convention places a default SKI next to the SMD — probe for it.
 */
export async function tryFallbackSkiPath(
  smdPath: string,
  getFile: (path: string) => Promise<Uint8Array | null>,
): Promise<string | null> {
  const guess = smdPath.replace(/\.smd$/i, '.ski');
  const result = await tryLoadSki(guess, getFile);
  return result?.archivePath ?? null;
}

/**
 * Discover STCK animation file paths for a model.
 * Uses SMD's tcksDir if available, otherwise constructs `tcks_<modelname>`.
 */
export function discoverStckPaths(
  smdPath: string,
  smdTcksDir: string | undefined,
  listFiles: (prefix: string) => string[],
): string[] {
  const tcksName = smdTcksDir
    || ('tcks_' + smdPath.split('\\').pop()!.replace(/\.[^.]+$/i, ''));
  const smdDir = smdPath.substring(0, smdPath.lastIndexOf('\\'));
  const trackDir = smdDir + '\\' + tcksName;
  return listFiles(trackDir).filter((p: string) => p.toLowerCase().endsWith('.stck'));
}

// ── Dependency collector ──

async function tryGet(
  getData: (path: string) => Promise<Uint8Array>,
  path: string,
): Promise<Uint8Array | null> {
  try { return await getData(path); }
  catch { return null; }
}

async function collectSkiTextures(
  getFile: (path: string) => Promise<Uint8Array | null>,
  wasm: AutoangelModule,
  skiData: Uint8Array,
  skiArchivePath: string,
  files: Map<string, Uint8Array>,
): Promise<void> {
  files.set(skiArchivePath, skiData);

  using skin = wasm.Skin.parse(skiData);
  const textureNames: string[] = skin.textures || [];

  for (const texName of textureNames) {
    for (const tp of textureCandidates(skiArchivePath, texName)) {
      if (files.has(tp)) break;
      const texData = await getFile(tp);
      if (texData) {
        files.set(tp, texData);
        break;
      }
    }
  }
}

/**
 * Collect all files needed to render an ECM model.
 *
 * Walks: ECM -> SMD -> BON, SKI[] -> textures[], STCK[],
 * plus AddiSkinPath[] and child ECMs (recursive with cycle detection).
 */
export async function collectEcmDependencies(
  wasm: AutoangelModule,
  ecmPath: string,
  getData: (path: string) => Promise<Uint8Array>,
  listFiles: (prefix: string) => string[],
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const visited = new Set<string>();
  const getFile = (path: string) => tryGet(getData, path);

  async function collect(ecmPath: string): Promise<void> {
    const normalizedEcm = ecmPath.toLowerCase();
    if (visited.has(normalizedEcm)) return;
    visited.add(normalizedEcm);

    const ecmData = await getFile(normalizedEcm);
    if (!ecmData) return;
    files.set(normalizedEcm, ecmData);

    using ecm = wasm.EcmModel.parse(ecmData);

    const smdPath = resolvePath(ecm.skinModelPath, normalizedEcm);
    const smdData = await getFile(smdPath);
    let smdSkinPaths: string[] = [];
    let smdTcksDir: string | undefined;

    if (smdData) {
      files.set(smdPath, smdData);
      using smd = wasm.SmdModel.parse(smdData);
      smdSkinPaths = smd.skinPaths || [];
      smdTcksDir = smd.tcksDir;

      const bonRelPath: string = smd.skeletonPath;
      if (bonRelPath) {
        const bonPath = resolvePath(bonRelPath, smdPath);
        const bonData = await getFile(bonPath);
        if (bonData) files.set(bonPath, bonData);
      }
    }

    const allSkinPaths = collectSkinPaths(
      smdPath, smdSkinPaths, normalizedEcm, ecm.additionalSkins || [],
    );
    if (allSkinPaths.length === 0) {
      const fallback = await tryFallbackSkiPath(smdPath, getFile);
      if (fallback) allSkinPaths.push(fallback);
    }

    for (const skiPath of allSkinPaths) {
      if (files.has(skiPath)) continue;
      const ski = await tryLoadSki(skiPath, getFile);
      if (ski) {
        await collectSkiTextures(getFile, wasm, ski.data, ski.archivePath, files);
      }
    }

    if (smdData) {
      for (const stckPath of discoverStckPaths(smdPath, smdTcksDir, listFiles)) {
        if (files.has(stckPath)) continue;
        const stckData = await getFile(stckPath);
        if (stckData) files.set(stckPath, stckData);
      }
    }

    for (let i = 0; i < ecm.childCount; i++) {
      const child = ecm.getChild(i);
      if (!child) continue;
      await collect(resolvePath(child.path, normalizedEcm));
    }
  }

  await collect(ecmPath);
  return files;
}
