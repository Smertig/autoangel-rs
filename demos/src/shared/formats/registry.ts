import type { FormatDescriptor } from './types';
import { modelFormat } from './model';
import { imageFormat } from './image';
import { gfxFormat } from './gfx';
import { textFormat } from './text';
import { fallbackFormat } from './fallback';

const formats: FormatDescriptor[] = [
  modelFormat,
  imageFormat,
  gfxFormat,
  textFormat,
  fallbackFormat,
];

export function findFormat(ext: string): FormatDescriptor {
  return formats.find(f => f.matches(ext)) ?? fallbackFormat;
}
