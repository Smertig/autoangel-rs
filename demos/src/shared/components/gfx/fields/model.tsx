import type { FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import type { ElementBody, GfxElement, ViewerCtx } from '../previews/types';

type ModelBody = Extract<ElementBody, { kind: 'model' }>;

export function buildModelRows(
  body: ModelBody,
  _element: GfxElement,
  ctx: ViewerCtx,
): FieldRow[] {
  const rows: FieldRow[] = [
    { label: 'model_path', value: <PathOrText value={body.model_path} findFile={ctx.findFile} onNavigate={ctx.onNavigateToFile} /> },
    ...(body.model_act_name ? [{ label: 'model_act_name', value: <span>{body.model_act_name}</span> } as FieldRow] : []),
    ...(body.loops !== undefined ? [{ label: 'loops', value: <MonoNum value={body.loops} /> } as FieldRow] : []),
    { divider: true },
    ...flagRows({
      alpha_cmp: body.alpha_cmp,
      write_z: body.write_z,
      use_3d_cam: body.use_3d_cam,
      facing_dir: body.facing_dir,
    }),
  ];
  return rows;
}

function flagRows(flags: Record<string, boolean | undefined>): FieldRow[] {
  return Object.entries(flags)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: k, value: <BoolDot on={!!v} /> }));
}
