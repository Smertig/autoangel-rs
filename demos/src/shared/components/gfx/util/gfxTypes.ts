import type { AutoangelModule } from '../../../../types/autoangel';

type ParseGfxResult = ReturnType<AutoangelModule['parseGfx']>;

export type GfxElement = ParseGfxResult['elements'][number];
export type ElementBody = GfxElement['body'];
export type KeyPointSet = NonNullable<GfxElement['key_point_set']>;
export type KeyPoint = KeyPointSet['keypoints'][number];
export type KpController = KeyPoint['controllers'][number];
export type KpCtrlBody = KpController['body'];
export type KpCtrlKind = KpCtrlBody['kind'];

/** Subset of `KpCtrlKind` for which `applyController` has an implementation. */
export type HandledCtrlKind = 'color' | 'scale' | 'cl_trans' | 'scale_trans';
