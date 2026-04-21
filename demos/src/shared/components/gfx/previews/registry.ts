import type { FC } from 'react';
import type { ElementBodyKind, PreviewProps } from './types';
import { ContainerPreview } from './ContainerPreview';
import { DecalPreview } from './decal/DecalPreview';
import { DefaultPreview } from './DefaultPreview';
import { LightPreview } from './LightPreview';
import { ModelPreview } from './ModelPreview';
import { ParticlePreview } from './ParticlePreview';
import { UnknownPreview } from './UnknownPreview';

type Registry = { [K in ElementBodyKind]: FC<PreviewProps<K>> };

export const PREVIEW_REGISTRY: Registry = {
  particle:      ParticlePreview,
  decal:         DecalPreview,
  trail:         DefaultPreview as FC<PreviewProps<'trail'>>,
  light:         LightPreview,
  ring:          DefaultPreview as FC<PreviewProps<'ring'>>,
  model:         ModelPreview,
  container:     ContainerPreview,
  grid_decal_3d: DefaultPreview as FC<PreviewProps<'grid_decal_3d'>>,
  lightning:     DefaultPreview as FC<PreviewProps<'lightning'>>,
  lightning_ex:  DefaultPreview as FC<PreviewProps<'lightning_ex'>>,
  ltn_bolt:      DefaultPreview as FC<PreviewProps<'ltn_bolt'>>,
  sound:         DefaultPreview as FC<PreviewProps<'sound'>>,
  unknown:       UnknownPreview,
};
