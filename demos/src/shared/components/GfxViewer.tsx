import { useState } from 'react';
import type { AutoangelModule } from '../../types/autoangel';

// --- Element type ID to human-readable name ---

const ELEMENT_TYPE_NAMES: Record<number, string> = {
  100: '3D Decal',
  101: '2D Decal',
  102: 'Billboard Decal',
  110: 'Trail',
  120: 'Particle (Point)',
  121: 'Particle (Box)',
  122: 'Particle (Multiplane)',
  123: 'Particle (Ellipsoid)',
  124: 'Particle (Cylinder)',
  125: 'Particle (Curve)',
  130: 'Light',
  140: 'Ring',
  150: 'Lightning',
  151: 'Lightning Bolt',
  152: 'Lightning Ex',
  160: 'Model',
  170: 'Sound',
  180: 'Lightning Trail',
  190: 'Paraboloid',
  200: 'GFX Container',
  210: 'Grid Decal 3D',
  211: 'Grid Decal 2D',
  220: 'Phys Emitter',
  221: 'Phys Point Emitter',
  230: 'EC Model',
  240: 'Ribbon',
};

function elementTypeName(id: number): string {
  return ELEMENT_TYPE_NAMES[id] ?? `Unknown (${id})`;
}

// --- Styles ---

const styles = {
  container: {
    height: '100%',
    overflow: 'auto',
    padding: '16px',
    background: '#1e1e22',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.85)',
    boxSizing: 'border-box' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '16px',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    background: 'rgba(123,164,232,0.15)',
    color: '#7ba4e8',
    fontWeight: 600,
    fontSize: '11px',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  metaLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '12px',
  },
  metaValue: {
    fontWeight: 500,
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: '12px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: '8px',
  },
  elementCard: {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    marginBottom: '8px',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.03)',
  },
  elementHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    background: 'rgba(255,255,255,0.05)',
  },
  elementTypeBadge: {
    display: 'inline-block',
    padding: '1px 7px',
    borderRadius: '3px',
    background: 'rgba(123,164,232,0.15)',
    color: '#7ba4e8',
    fontWeight: 600,
    fontSize: '11px',
    whiteSpace: 'nowrap' as const,
  },
  dummyBadge: {
    display: 'inline-block',
    padding: '1px 7px',
    borderRadius: '3px',
    background: 'rgba(210,150,50,0.15)',
    color: '#d4a04a',
    fontWeight: 600,
    fontSize: '11px',
  },
  elementName: {
    flex: 1,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  chevron: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: '11px',
    flexShrink: 0,
  },
  elementBody: {
    padding: '8px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  fieldRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '4px',
    flexWrap: 'wrap' as const,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.4)',
    minWidth: '80px',
    flexShrink: 0,
  },
  fieldValue: {
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: '12px',
  },
  bodyPre: {
    marginTop: '8px',
    padding: '8px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '4px',
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    color: 'rgba(255,255,255,0.65)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '300px',
    overflow: 'auto',
  },
  bodyToggle: {
    marginTop: '6px',
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#7ba4e8',
    cursor: 'pointer',
    fontSize: '12px',
    textDecoration: 'underline',
  },
  errorBox: {
    padding: '12px 16px',
    color: '#e87b7b',
    background: 'rgba(200,50,50,0.1)',
    border: '1px solid rgba(200,50,50,0.3)',
    borderRadius: '6px',
    marginBottom: '12px',
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: '12px',
    whiteSpace: 'pre-wrap' as const,
  },
  rawFallback: {
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
};

// --- Element card component ---

interface ElementCardProps {
  gfx: ReturnType<AutoangelModule['GfxEffect']['parse']>;
  index: number;
}

function ElementCard({ gfx, index }: ElementCardProps) {
  const [open, setOpen] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);

  const typeId = gfx.elementType(index);
  const name = gfx.elementName(index) ?? '';
  const texFile = gfx.elementTexFile(index) ?? '';
  const srcBlend = gfx.elementSrcBlend(index);
  const destBlend = gfx.elementDestBlend(index);
  const texRow = gfx.elementTexRow(index);
  const texCol = gfx.elementTexCol(index);
  const repeatCount = gfx.elementRepeatCount(index);
  const isDummy = gfx.elementIsDummy(index);
  const priority = gfx.elementPriority(index);
  const bodyText = gfx.elementBodyText(index) ?? '';

  const hasAtlas = texRow !== 1 || texCol !== 1;
  const hasRepeat = repeatCount !== 0;
  const hasPriority = priority !== 0;
  const hasBody = bodyText.trim().length > 0;

  return (
    <div style={styles.elementCard}>
      <div style={styles.elementHeader} onClick={() => setOpen(o => !o)}>
        <span style={styles.elementTypeBadge}>{elementTypeName(typeId)}</span>
        {isDummy && <span style={styles.dummyBadge}>dummy</span>}
        <span style={styles.elementName}>{name || <em style={{ color: 'rgba(255,255,255,0.3)' }}>unnamed</em>}</span>
        <span style={styles.chevron}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={styles.elementBody}>
          {texFile && (
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>Texture</span>
              <span style={styles.fieldValue}>{texFile}</span>
            </div>
          )}
          <div style={styles.fieldRow}>
            <span style={styles.fieldLabel}>Blend</span>
            <span style={styles.fieldValue}>src={srcBlend} dest={destBlend}</span>
          </div>
          {hasAtlas && (
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>Atlas</span>
              <span style={styles.fieldValue}>{texRow}×{texCol}</span>
            </div>
          )}
          {hasRepeat && (
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>Repeat</span>
              <span style={styles.fieldValue}>{repeatCount}</span>
            </div>
          )}
          {hasPriority && (
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>Priority</span>
              <span style={styles.fieldValue}>{priority}</span>
            </div>
          )}
          {hasBody && (
            <>
              <button style={styles.bodyToggle} onClick={() => setBodyOpen(o => !o)}>
                {bodyOpen ? 'Hide body' : 'Show body'}
              </button>
              {bodyOpen && <pre style={styles.bodyPre}>{bodyText}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main viewer ---

export interface GfxViewerProps {
  data: Uint8Array;
  wasm: AutoangelModule;
}

export function GfxViewer({ data, wasm }: GfxViewerProps) {
  let gfx: ReturnType<AutoangelModule['GfxEffect']['parse']> | null = null;
  let parseError: string | null = null;
  let rawText: string | null = null;

  try {
    gfx = wasm.GfxEffect.parse(data);
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e);
    try {
      rawText = new TextDecoder('gbk').decode(data);
    } catch {
      rawText = new TextDecoder('utf-8', { fatal: false }).decode(data);
    }
  }

  const elementCount = gfx ? gfx.elementCount : 0;

  return (
    <div style={styles.container}>
      {parseError && (
        <div style={styles.errorBox}>Parse error: {parseError}</div>
      )}

      {gfx && (
        <>
          <div style={styles.header}>
            <span style={styles.badge}>GFX v{gfx.version}</span>
            <span style={{ ...styles.metaItem, ...styles.metaLabel }}>
              {elementCount} element{elementCount !== 1 ? 's' : ''}
            </span>
          </div>

          <div style={styles.metaRow}>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Scale</span>
              <span style={styles.metaValue}>{gfx.defaultScale.toFixed(3)}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Speed</span>
              <span style={styles.metaValue}>{gfx.playSpeed.toFixed(3)}</span>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Alpha</span>
              <span style={styles.metaValue}>{gfx.defaultAlpha.toFixed(3)}</span>
            </div>
          </div>

          {elementCount > 0 && (
            <>
              <div style={styles.sectionTitle}>Elements</div>
              {Array.from({ length: elementCount }, (_, i) => (
                <ElementCard key={i} gfx={gfx!} index={i} />
              ))}
            </>
          )}
        </>
      )}

      {parseError && rawText !== null && (
        <>
          <div style={styles.sectionTitle}>Raw content</div>
          <pre style={styles.rawFallback}>{rawText}</pre>
        </>
      )}
    </div>
  );
}
