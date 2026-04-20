import type { FormatDescriptor } from './types';
import { ecmFormat } from './ecm';
import { smdFormat } from './smd';
import { skiFormat } from './ski';
import { stckFormat } from './stck';
import { imageFormat } from './image';
import { gfxFormat } from './gfx';
import { textFormat } from './text';
import { fallbackFormat } from './fallback';

const formats: FormatDescriptor[] = [
  ecmFormat,
  smdFormat,
  skiFormat,
  stckFormat,
  imageFormat,
  gfxFormat,
  textFormat,
  fallbackFormat,
];

export function findFormat(ext: string): FormatDescriptor {
  return formats.find(f => f.matches(ext)) ?? fallbackFormat;
}
