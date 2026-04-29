import type { FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import type { ElementBody, GfxElement, ViewerCtx } from '../types';
import { flagRows } from './_helpers';

type ContainerBody = Extract<ElementBody, { kind: 'container' }>;

export function buildContainerRows(
  body: ContainerBody,
  _element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  return [
    { label: 'gfx_path', value: <PathOrText value={body.gfx_path} pkg={ctx.pkg} onNavigate={ctx.onNavigateToFile} /> },
    ...(body.loop_flag !== undefined ? [{ label: 'loop_flag', value: <BoolDot on={body.loop_flag} /> } as FieldRow] : []),
    ...(body.play_speed !== undefined ? [{ label: 'play_speed', value: <MonoNum value={body.play_speed} /> } as FieldRow] : []),
    ...flagRows({ out_color: body.out_color, dummy_use_g_scale: body.dummy_use_g_scale }),
  ];
}
