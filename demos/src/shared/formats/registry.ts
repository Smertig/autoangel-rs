import type { FormatDescriptor } from './types';
import { modelFormat } from './model';
import { imageFormat } from './image';
import { textFormat } from './text';
import { fallbackFormat } from './fallback';

const formats: FormatDescriptor[] = [
  modelFormat,
  imageFormat,
  textFormat,
  fallbackFormat,
];

export function findFormat(ext: string): FormatDescriptor {
  return formats.find(f => f.matches(ext)) ?? fallbackFormat;
}
