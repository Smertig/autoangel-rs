import type { AutoangelModule } from '../../types/autoangel';
import type { PackageView } from '../package';
import { basename, dirname, normalizePath } from './path';

// Helpers normalize their inputs — format fields read from WASM may still
// carry backslashes from the stored binary, but the canonical JS form is
// lowercase + forward-slash (see `shared/util/path.ts`).

/** Resolve a ref relative to a parent file's directory. */
export function resolveRelative(parentPath: string, ref: string): string {
  return normalizePath(dirname(normalizePath(parentPath)) + ref);
}

/**
 * Resolve a file reference that may be absolute (contains a separator) or relative.
 * Absolute paths are normalized to canonical JS form; relative ones are
 * resolved against parentPath.
 */
export function resolvePath(refPath: string, parentPath: string): string {
  return /[\\/]/.test(refPath)
    ? normalizePath(refPath)
    : resolveRelative(parentPath, refPath);
}

/**
 * Build candidate archive paths for a texture referenced by a SKI file.
 * The engine tries three locations in order: textures/ subdir, tex_<skinname>/ subdir, bare.
 */
export function textureCandidates(skiArchivePath: string, texName: string): string[] {
  const ski = normalizePath(skiArchivePath);
  const stem = basename(ski).replace(/\.ski$/i, '');
  return [
    resolveRelative(ski, 'textures/' + texName),
    resolveRelative(ski, 'tex_' + stem + '/' + texName),
    resolveRelative(ski, texName),
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
 * Try to load a SKI file, falling back to a `models/` prefix if the direct path fails.
 * Some archives store skins under models/ but reference them without the prefix.
 */
export async function tryLoadSki(
  skiPath: string,
  pkg: PackageView,
): Promise<{ data: Uint8Array; archivePath: string } | null> {
  const direct = normalizePath(skiPath);
  let data = await pkg.read(direct);
  if (data) return { data, archivePath: direct };
  if (!direct.startsWith('models/')) {
    const withPrefix = 'models/' + direct;
    data = await pkg.read(withPrefix);
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
  pkg: PackageView,
): Promise<string | null> {
  const guess = smdPath.replace(/\.smd$/i, '.ski');
  const result = await tryLoadSki(guess, pkg);
  return result?.archivePath ?? null;
}

/**
 * Discover STCK animation file paths for a model.
 * Uses SMD's tcksDir if available, otherwise constructs `tcks_<modelname>`.
 */
export function discoverStckPaths(
  smdPath: string,
  smdTcksDir: string | undefined,
  pkg: PackageView,
): string[] {
  const p = normalizePath(smdPath);
  const tcksName = smdTcksDir
    || ('tcks_' + basename(p).replace(/\.[^.]+$/i, ''));
  const trackDir = dirname(p) + tcksName;
  return pkg.list(trackDir).filter((q) => q.endsWith('.stck'));
}

// ── Dependency collector ──

async function collectSkiTextures(
  pkg: PackageView,
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
      const texData = await pkg.read(tp);
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
  pkg: PackageView,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const visited = new Set<string>();

  async function collect(ecmPath: string): Promise<void> {
    const normalizedEcm = normalizePath(ecmPath);
    if (visited.has(normalizedEcm)) return;
    visited.add(normalizedEcm);

    const ecmData = await pkg.read(normalizedEcm);
    if (!ecmData) return;
    files.set(normalizedEcm, ecmData);

    using ecm = wasm.EcmModel.parse(ecmData);

    const smdPath = resolvePath(ecm.skinModelPath, normalizedEcm);
    const smdData = await pkg.read(smdPath);
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
        const bonData = await pkg.read(bonPath);
        if (bonData) files.set(bonPath, bonData);
      }
    }

    const allSkinPaths = collectSkinPaths(
      smdPath, smdSkinPaths, normalizedEcm, ecm.additionalSkins || [],
    );
    if (allSkinPaths.length === 0) {
      const fallback = await tryFallbackSkiPath(smdPath, pkg);
      if (fallback) allSkinPaths.push(fallback);
    }

    for (const skiPath of allSkinPaths) {
      if (files.has(skiPath)) continue;
      const ski = await tryLoadSki(skiPath, pkg);
      if (ski) {
        await collectSkiTextures(pkg, wasm, ski.data, ski.archivePath, files);
      }
    }

    if (smdData) {
      for (const stckPath of discoverStckPaths(smdPath, smdTcksDir, pkg)) {
        if (files.has(stckPath)) continue;
        const stckData = await pkg.read(stckPath);
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
