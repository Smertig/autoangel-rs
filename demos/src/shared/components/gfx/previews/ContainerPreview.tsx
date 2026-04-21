import { useMemo } from 'react';
import { FieldPanel, FieldRow } from '../fieldPanel';
import { BoolDot, MonoNum, PathOrText } from '../formatters';
import { GfxViewer } from '@shared/components/gfx/GfxViewer';
import { MissingPackageBanner } from '../MissingPackageBanner';
import { resolveEnginePath, ENGINE_PATH_PREFIXES } from '../util/resolveEnginePath';
import { useFileData } from '@shared/hooks/useFileData';
import type { PreviewProps, ViewerCtx } from './types';
import styles from './ContainerPreview.module.css';


export function ContainerPreview({ body, context, expanded }: PreviewProps<'container'>) {
  if (!expanded) return <span className={styles.thumb}>C</span>;

  const rows: FieldRow[] = [
    { label: 'gfx_path', value: <PathOrText value={body.gfx_path} listFiles={context.listFiles} /> },
    ...(body.loop_flag !== undefined ? [{ label: 'loop_flag', value: <BoolDot on={body.loop_flag} /> }] : []),
    ...(body.play_speed !== undefined ? [{ label: 'play_speed', value: <MonoNum value={body.play_speed} /> }] : []),
    ...flagRows({ out_color: body.out_color, dummy_use_g_scale: body.dummy_use_g_scale }),
  ];

  return (
    <div className={styles.expanded}>
      <FieldPanel rows={rows} />
      <NestedGfxViewer gfxPath={body.gfx_path} context={context} />
    </div>
  );
}

function NestedGfxViewer({ gfxPath, context }: { gfxPath: string; context: ViewerCtx }) {
  const resolved = useMemo(() => {
    if (!context.listFiles) {
      return { kind: 'fallback' as const, path: `gfx\\${gfxPath}` };
    }
    const match = resolveEnginePath(gfxPath, ENGINE_PATH_PREFIXES.gfx, context.listFiles);
    return match
      ? { kind: 'resolved' as const, path: match }
      : { kind: 'missing' as const, engineTarget: `gfx\\${gfxPath}` };
  }, [gfxPath, context.listFiles]);

  if (resolved.kind === 'missing') {
    return (
      <MissingPackageBanner title="Referenced GFX not found in any loaded package.">
        Expected at <code>{resolved.engineTarget}</code>.
      </MissingPackageBanner>
    );
  }
  return <ResolvedNestedGfxViewer resolvedPath={resolved.path} context={context} />;
}

function ResolvedNestedGfxViewer({ resolvedPath, context }: { resolvedPath: string; context: ViewerCtx }) {
  const state = useFileData(resolvedPath, context.getData);
  const childContext = useMemo(() => ({ ...context, path: resolvedPath }), [context, resolvedPath]);

  if (state.status === 'loading') return <div className={styles.loading}>Loading nested GFX…</div>;
  if (state.status === 'error')   return <div className={styles.errorChip}>Failed to load: {state.message}</div>;
  return <GfxViewer data={state.data} context={childContext} />;
}

function flagRows(flags: Record<string, boolean | undefined>): FieldRow[] {
  return Object.entries(flags)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ label: k, value: <BoolDot on={!!v} /> }));
}
