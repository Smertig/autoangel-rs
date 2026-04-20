import { FieldPanel, FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import { ModelViewer } from '@shared/components/ModelViewer';
import type { PreviewProps } from './types';
import styles from './ModelPreview.module.css';

export function ModelPreview({ body, context, expanded }: PreviewProps<'model'>) {
  if (!expanded) return <span className={styles.thumb}>M</span>;

  const rows: FieldRow[] = [
    { label: 'model_path', value: <PathOrText value={body.model_path} listFiles={context.listFiles} /> },
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

// Engine prepends "gfx\Models\" before loading — see
// third_party/angelica_src/A3DGFXModel.cpp:419. Match case-insensitively
// because pcks store lowercase paths and ".smd" but model_path usually
// has ".SMD" engine-casing.
function resolveModelPath(
  modelPath: string,
  listFiles: (prefix: string) => string[],
): string | null {
  const target = `gfx\\Models\\${modelPath}`.toLowerCase();
  for (const prefix of ['gfx\\models\\', 'gfx\\Models\\']) {
    const match = listFiles(prefix).find((p) => p.toLowerCase() === target);
    if (match) return match;
  }
  return null;
}

function ModelPreviewViewer({
  body,
  context,
}: Pick<PreviewProps<'model'>, 'body' | 'context'>) {
  const resolved = context.listFiles
    ? resolveModelPath(body.model_path, context.listFiles)
    : `gfx\\Models\\${body.model_path}`;

  if (resolved === null) {
    return (
      <div className={styles.missingBanner} role="status">
        <span className={styles.missingIcon} aria-hidden="true">⊘</span>
        <div className={styles.missingText}>
          <strong>Model source not in any loaded package.</strong>{' '}
          Engine loads <code>gfx\Models\{body.model_path}</code> —
          add the package containing this file via the{' '}
          <em>+ Add packages</em> button above.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      <ModelViewer
        path={resolved}
        wasm={context.wasm}
        getData={context.getData}
        listFiles={context.listFiles}
      />
    </div>
  );
}

function flagRows(flags: Record<string, boolean | undefined>): FieldRow[] {
  return Object.entries(flags)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: k, value: <BoolDot on={!!v} /> }));
}
