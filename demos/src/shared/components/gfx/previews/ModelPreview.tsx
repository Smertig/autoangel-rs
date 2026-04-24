import { FieldPanel, FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import { SmdViewer } from '@shared/components/model-viewer';
import { MissingPackageBanner } from '../MissingPackageBanner';
import { resolveEnginePath, ENGINE_PATH_PREFIXES } from '../util/resolveEnginePath';
import type { PreviewProps } from './types';
import styles from './ModelPreview.module.css';


export function ModelPreview({ body, context, expanded }: PreviewProps<'model'>) {
  if (!expanded) return <span className={styles.thumb}>M</span>;

  const rows: FieldRow[] = [
    { label: 'model_path', value: <PathOrText value={body.model_path} findFile={context.findFile} onNavigate={context.onNavigateToFile} /> },
    ...(body.model_act_name ? [{ label: 'model_act_name', value: <span>{body.model_act_name}</span> }] : []),
    ...(body.loops !== undefined ? [{ label: 'loops', value: <MonoNum value={body.loops} /> }] : []),
    { divider: true },
    ...flagRows({
      alpha_cmp: body.alpha_cmp,
      write_z: body.write_z,
      use_3d_cam: body.use_3d_cam,
      facing_dir: body.facing_dir,
    }),
  ];

  return (
    <div className={styles.expanded}>
      <FieldPanel rows={rows} />
      <ModelPreviewViewer body={body} context={context} />
    </div>
  );
}

function ModelPreviewViewer({
  body,
  context,
}: Pick<PreviewProps<'model'>, 'body' | 'context'>) {
  const resolved = resolveEnginePath(body.model_path, ENGINE_PATH_PREFIXES.models, context.findFile);

  if (resolved === null) {
    return (
      <MissingPackageBanner title="Model source not in any loaded package.">
        Engine loads <code>gfx\Models\{body.model_path}</code> —
        add the package containing this file via the{' '}
        <em>+ Add packages</em> button above.
      </MissingPackageBanner>
    );
  }

  return (
    <div className={styles.viewer}>
      <SmdViewer
        path={resolved}
        wasm={context.wasm}
        getData={context.getData}
        listFiles={context.listFiles}
        findFile={context.findFile}
        initialClipName={body.model_act_name}
      />
    </div>
  );
}

function flagRows(flags: Record<string, boolean | undefined>): FieldRow[] {
  return Object.entries(flags)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: k, value: <BoolDot on={!!v} /> }));
}
