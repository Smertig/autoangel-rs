import { lazy, type LazyExoticComponent } from 'react';
import { IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, TEXT_EXTENSIONS } from '@shared/util/files';
import type { FormatDescriptor } from './types';

export interface FormatLoader {
  name: string;
  matches(ext: string): boolean;
  load(): Promise<FormatDescriptor>;
}

const loaders: FormatLoader[] = [
  { name: 'ecm',   matches: (ext) => ext === '.ecm',   load: () => import('./ecm').then(m => m.ecmFormat) },
  { name: 'smd',   matches: (ext) => ext === '.smd',   load: () => import('./smd').then(m => m.smdFormat) },
  { name: 'ski',   matches: (ext) => ext === '.ski',   load: () => import('./ski').then(m => m.skiFormat) },
  { name: 'stck',  matches: (ext) => ext === '.stck',  load: () => import('./stck').then(m => m.stckFormat) },
  { name: 'image', matches: (ext) => IMAGE_EXTENSIONS.has(ext) || CANVAS_IMAGE_EXTENSIONS.has(ext), load: () => import('./image').then(m => m.imageFormat) },
  { name: 'gfx',   matches: (ext) => ext === '.gfx',   load: () => import('./gfx').then(m => m.gfxFormat) },
  { name: 'text',  matches: (ext) => TEXT_EXTENSIONS.has(ext), load: () => import('./text').then(m => m.textFormat) },
];

const fallbackLoader: FormatLoader = {
  name: 'fallback',
  matches: () => true,
  load: () => import('./fallback').then(m => m.fallbackFormat),
};

export function findFormat(ext: string): FormatLoader {
  return loaders.find(f => f.matches(ext)) ?? fallbackLoader;
}

type LazyPart<K extends 'Viewer' | 'Differ'> = LazyExoticComponent<FormatDescriptor[K]>;

const lazyCache = new WeakMap<FormatLoader, { Viewer?: LazyPart<'Viewer'>; Differ?: LazyPart<'Differ'> }>();

export function lazyFormatComponent<K extends 'Viewer' | 'Differ'>(
  loader: FormatLoader,
  key: K,
): LazyPart<K> {
  let entry = lazyCache.get(loader);
  if (!entry) {
    entry = {};
    lazyCache.set(loader, entry);
  }
  const cached = entry[key] as LazyPart<K> | undefined;
  if (cached) return cached;
  const Component: LazyPart<K> = lazy(() => loader.load().then((f) => ({ default: f[key] })));
  entry[key] = Component as LazyPart<'Viewer'> & LazyPart<'Differ'>;
  return Component;
}
