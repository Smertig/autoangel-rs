import type { AutoangelModule } from '../../types/autoangel';

export function resolveRelative(parentPath: string, basename: string): string {
  const dir = parentPath.substring(0, parentPath.lastIndexOf('\\') + 1);
  return (dir + basename).toLowerCase();
}

async function tryGet(
  getData: (path: string) => Promise<Uint8Array>,
  path: string,
): Promise<Uint8Array | null> {
  try { return await getData(path); }
  catch { return null; }
}

async function collectSki(
  getData: (path: string) => Promise<Uint8Array>,
  wasm: AutoangelModule,
  skiData: Uint8Array,
  skiArchivePath: string,
  files: Map<string, Uint8Array>,
): Promise<void> {
  files.set(skiArchivePath, skiData);

  using skin = wasm.Skin.parse(skiData);
  const textureNames: string[] = skin.textures || [];
  const skiBasename = skiArchivePath.split('\\').pop()!.replace(/\.ski$/i, '');

  for (const texName of textureNames) {
    const candidates = [
      resolveRelative(skiArchivePath, 'textures\\' + texName),
      resolveRelative(skiArchivePath, 'tex_' + skiBasename + '\\' + texName),
      resolveRelative(skiArchivePath, texName),
    ];
    for (const tp of candidates) {
      if (files.has(tp)) break;
      const texData = await tryGet(getData, tp);
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
  listFiles?: (prefix: string) => string[],
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const visited = new Set<string>();

  async function collect(ecmPath: string): Promise<void> {
    const normalizedEcm = ecmPath.toLowerCase();
    if (visited.has(normalizedEcm)) return;
    visited.add(normalizedEcm);

    const ecmData = await tryGet(getData, normalizedEcm);
    if (!ecmData) return;
    files.set(normalizedEcm, ecmData);

    using ecm = wasm.EcmModel.parse(ecmData);

    const smdRelPath = ecm.skinModelPath;
    const smdPath = smdRelPath.includes('\\')
      ? smdRelPath.toLowerCase()
      : resolveRelative(normalizedEcm, smdRelPath);

    const smdData = await tryGet(getData, smdPath);
    let smdSkinPaths: string[] = [];
    let smdTcksDir: string | undefined;

    if (smdData) {
      files.set(smdPath, smdData);
      using smd = wasm.SmdModel.parse(smdData);
      smdSkinPaths = smd.skinPaths || [];
      smdTcksDir = smd.tcksDir;

      const bonRelPath: string = smd.skeletonPath;
      if (bonRelPath) {
        const bonPath = bonRelPath.includes('\\')
          ? bonRelPath.toLowerCase()
          : resolveRelative(smdPath, bonRelPath);
        const bonData = await tryGet(getData, bonPath);
        if (bonData) files.set(bonPath, bonData);
      }
    }

    const allSkinPaths: string[] = [];
    for (const sp of smdSkinPaths) {
      if (sp) allSkinPaths.push(resolveRelative(smdPath, sp));
    }
    for (const sp of ecm.additionalSkins || []) {
      const resolved = sp.includes('\\') ? sp.toLowerCase() : resolveRelative(normalizedEcm, sp);
      if (!allSkinPaths.includes(resolved)) allSkinPaths.push(resolved);
    }

    for (const skiPath of allSkinPaths) {
      if (files.has(skiPath)) continue;
      let skiData = await tryGet(getData, skiPath);
      let skiArchivePath = skiPath;
      if (!skiData && !skiPath.startsWith('models\\')) {
        const withPrefix = 'models\\' + skiPath;
        skiData = await tryGet(getData, withPrefix);
        if (skiData) skiArchivePath = withPrefix;
      }
      if (skiData) {
        await collectSki(getData, wasm, skiData, skiArchivePath, files);
      }
    }

    if (listFiles && smdData) {
      const tcksName = smdTcksDir
        || ('tcks_' + smdPath.split('\\').pop()!.replace(/\.[^.]+$/i, ''));
      const smdDir = smdPath.substring(0, smdPath.lastIndexOf('\\'));
      const trackDir = smdDir + '\\' + tcksName;
      const stckPaths = listFiles(trackDir).filter((p: string) => p.toLowerCase().endsWith('.stck'));
      for (const stckPath of stckPaths) {
        if (files.has(stckPath)) continue;
        const stckData = await tryGet(getData, stckPath);
        if (stckData) files.set(stckPath, stckData);
      }
    }

    for (let i = 0; i < ecm.childCount; i++) {
      const childRel = ecm.childPath(i);
      if (!childRel) continue;
      const childPath = childRel.includes('\\')
        ? childRel.toLowerCase()
        : resolveRelative(normalizedEcm, childRel);
      await collect(childPath);
    }
  }

  await collect(ecmPath);
  return files;
}
