import type { AutoangelModule } from './types/autoangel';

let cachedModule: AutoangelModule | null = null;

export async function initWasm(cdn: string): Promise<AutoangelModule> {
  if (cachedModule) return cachedModule;
  const mod = await import(/* @vite-ignore */ `${cdn}/autoangel.js`);
  await mod.default(`${cdn}/autoangel_bg.wasm`);
  cachedModule = mod as AutoangelModule;
  return cachedModule;
}
