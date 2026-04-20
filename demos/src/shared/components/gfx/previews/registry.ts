import type { FC } from 'react';
import type { ElementBodyKind, PreviewProps } from './types';
import { DefaultPreview } from './DefaultPreview';
import { LightPreview } from './LightPreview';
import { ModelPreview } from './ModelPreview';
import { UnknownPreview } from './UnknownPreview';

type Registry = { [K in ElementBodyKind]: FC<PreviewProps<K>> };

export const PREVIEW_REGISTRY: Registry = {
  particle:      DefaultPreview as FC<PreviewProps<'particle'>>,
  decal:         DefaultPreview as FC<PreviewProps<'decal'>>,
  trail:         DefaultPreview as FC<PreviewProps<'trail'>>,
  light:         LightPreview,
  ring:          DefaultPreview as FC<PreviewProps<'ring'>>,
  model:         ModelPreview,
  container:     DefaultPreview as FC<PreviewProps<'container'>>,
  grid_decal_3d: DefaultPreview as FC<PreviewProps<'grid_decal_3d'>>,
  lightning:     DefaultPreview as FC<PreviewProps<'lightning'>>,
  lightning_ex:  DefaultPreview as FC<PreviewProps<'lightning_ex'>>,
  ltn_bolt:      DefaultPreview as FC<PreviewProps<'ltn_bolt'>>,
  sound:         DefaultPreview as FC<PreviewProps<'sound'>>,
  unknown:       UnknownPreview,
};
