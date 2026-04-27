export type ChangelogScope = 'elements' | 'pck' | 'pck-diff' | 'shared';

export interface ChangelogEntry {
  /** Stable slug, unique forever. Used as the seen-marker (resilient to same-date entries). */
  id: string;
  /** ISO date 'YYYY-MM-DD'. Sort key. */
  date: string;
  scope: ChangelogScope;
  title: string;
  /** Optional one-sentence body. */
  body?: string;
}

export type DemoScope = Exclude<ChangelogScope, 'shared'>;

type LastSeen = Partial<Record<ChangelogScope, string>>;

export const LAST_SEEN_KEY = 'demos:changelogLastSeen';

/**
 * Hand-edited list of changelog entries. Newest first by convention; render-time sort handles
 * out-of-order edits. Add a new entry by prepending an object literal.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-04-27-bmd-rendering',
    date: '2026-04-27',
    scope: 'pck',
    title: 'Render BMD building models',
  },
  {
    id: '2026-04-27-changelog',
    date: '2026-04-27',
    scope: 'shared',
    title: 'In-app changelog',
    body: 'Click the sparkle in the top bar to see what changed.',
  },
  {
    id: '2026-04-26-model-viewer-persist',
    date: '2026-04-26',
    scope: 'pck',
    title: 'Model viewer remembers your view',
    body: 'Camera, animation, and view settings stick per recent file.',
  },
  {
    id: '2026-04-26-ecm-gfx-tail',
    date: '2026-04-26',
    scope: 'pck',
    title: 'ECM GFX tail playback',
    body: 'GFX from a one-shot ECM event plays out fully, even after the clip ends.',
  },
  {
    id: '2026-04-26-anim-list-polish',
    date: '2026-04-26',
    scope: 'pck',
    title: 'Animation list improvements',
    body: 'Resizable panel, filter input, log-scale 0.25–4× speed slider, drag-friendly scrubber.',
  },
  {
    id: '2026-04-26-gfx-render-toggle',
    date: '2026-04-26',
    scope: 'pck',
    title: 'Per-kind GFX render toggle',
    body: 'Show or hide GFX in the model viewer by element kind.',
  },
  {
    id: '2026-04-25-decal-runtime',
    date: '2026-04-25',
    scope: 'pck',
    title: 'Decals in GFX preview',
    body: 'Decal types 100 and 102 now show in the GFX preview.',
  },
  {
    id: '2026-04-24-jump-to-file',
    date: '2026-04-24',
    scope: 'pck',
    title: 'Click GFX/sound paths to jump to the file',
  },
  {
    id: '2026-04-24-startup-perf',
    date: '2026-04-24',
    scope: 'shared',
    title: 'Smoother startup',
    body: 'Previews load on demand, the boot bar shows progress, and the theme paints first to prevent flash.',
  },
  {
    id: '2026-04-22-pck-history',
    date: '2026-04-22',
    scope: 'pck',
    title: 'Recent PCK packages',
    body: 'One-click reopen of recent packages, with visited files remembered per session.',
  },
  {
    id: '2026-04-22-tree-folder-focus',
    date: '2026-04-22',
    scope: 'shared',
    title: 'Click a folder to focus it',
  },
  {
    id: '2026-04-22-gfx-timeline',
    date: '2026-04-22',
    scope: 'pck',
    title: 'GFX timeline improvements',
    body: 'Richer event tooltips, event clustering, render toggle, and click-to-copy paths.',
  },
  {
    id: '2026-04-21-particle-3d',
    date: '2026-04-21',
    scope: 'pck',
    title: '3D particle simulation',
    body: 'Point, cylinder, and ellipsoid emitters now simulate in 3D inside GFX previews.',
  },
  {
    id: '2026-04-20-model-formats',
    date: '2026-04-20',
    scope: 'pck',
    title: 'Built-in model previews',
    body: 'Render .smd files, ecm Model elements, and gfx Model elements with bones, animations, and BMP/PNG/JPG textures.',
  },
  {
    id: '2026-04-16-multi-package',
    date: '2026-04-16',
    scope: 'pck',
    title: 'Open multiple PCKs at once',
    body: 'Multi-package mode with a merged file tree.',
  },
  {
    id: '2026-04-15-gfx-viewer',
    date: '2026-04-15',
    scope: 'pck',
    title: 'GFX effect viewer and event timeline',
    body: 'Browse .gfx files and see GFX events plotted on the model viewer animation timeline.',
  },
  {
    id: '2026-04-14-ui-polish',
    date: '2026-04-14',
    scope: 'shared',
    title: 'UI improvements',
    body: 'Theme toggle, tree-filter input with progress, copy-path on entries, and HLSL syntax highlighting.',
  },
  {
    id: '2026-04-14-anim-list-panel',
    date: '2026-04-14',
    scope: 'pck',
    title: 'Animation clip side panel',
    body: 'Replaces the per-clip dropdown with a scrollable list you can scan and pick from.',
  },
  {
    id: '2026-04-13-stck-playback',
    date: '2026-04-13',
    scope: 'pck',
    title: 'Skeletal animation playback',
    body: 'STCK clips play on ECM models with bone scaling and per-clip selection.',
  },
  {
    id: '2026-04-15-ecm-pck-download',
    date: '2026-04-15',
    scope: 'pck',
    title: 'Download ECM models with dependencies',
    body: 'Pack an ECM and its referenced files into a single .pck for offline use.',
  },
  {
    id: '2026-04-08-ecm-preview',
    date: '2026-04-08',
    scope: 'pck',
    title: '3D model preview for ECM',
    body: 'Preview ECM characters with skeleton, meshes, and textures inside the pck viewer.',
  },
  {
    id: '2026-04-07-multipart-large',
    date: '2026-04-07',
    scope: 'shared',
    title: 'Multi-part archives, 4GB+, streaming progress',
    body: 'Open packages split across .pck + .pkx1…pkxN, with parsing progress shown per file.',
  },
  {
    id: '2026-04-06-image-decoders',
    date: '2026-04-06',
    scope: 'shared',
    title: 'Built-in DDS / TGA image preview',
    body: 'Broader format coverage and faster image preview.',
  },
  {
    id: '2026-04-06-pck-diff',
    date: '2026-04-06',
    scope: 'pck-diff',
    title: 'PCK Diff demo',
    body: 'Compare two archives side-by-side, with file tree and image diff modes.',
  },
  {
    id: '2026-04-05-pck-keys',
    date: '2026-04-05',
    scope: 'pck',
    title: 'Custom encryption keys',
    body: 'Add your own keys when the bundled set can\'t decrypt a package.',
  },
  {
    id: '2026-04-05-elements-config',
    date: '2026-04-05',
    scope: 'elements',
    title: 'Custom elements.data config',
    body: 'Use your own dialect config in place of the bundled one; parse errors show inline.',
  },
  {
    id: '2026-04-04-launch',
    date: '2026-04-04',
    scope: 'shared',
    title: 'Initial demo hub: elements and pck viewers',
    body: 'Browser-based viewers for elements.data and .pck files, with a shared landing page.',
  },
];

export function readLastSeen(): LastSeen {
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLastSeen(value: LastSeen): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota); silently ignore.
  }
}

function sortDesc<T extends { date: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => b.date.localeCompare(a.date));
}

function latestIdFor(scope: ChangelogScope, entries: ChangelogEntry[]): string | undefined {
  const inScope = sortDesc(entries.filter(e => e.scope === scope));
  return inScope[0]?.id;
}

export function entriesForScope(
  scope: DemoScope | null,
  entries: ChangelogEntry[] = CHANGELOG,
): ChangelogEntry[] {
  if (scope === null) return sortDesc(entries);
  return sortDesc(entries.filter(e => e.scope === scope || e.scope === 'shared'));
}

function dateOfId(id: string | undefined, entries: ChangelogEntry[]): string | null {
  if (!id) return null;
  return entries.find(e => e.id === id)?.date ?? null;
}

function isUnseenAgainst(e: ChangelogEntry, last: LastSeen, entries: ChangelogEntry[]): boolean {
  const markerKey: ChangelogScope = e.scope === 'shared' ? 'shared' : e.scope;
  const markerDate = dateOfId(last[markerKey], entries);
  return markerDate === null || e.date > markerDate;
}

export function hasUnseen(scope: DemoScope, entries: ChangelogEntry[] = CHANGELOG): boolean {
  const last = readLastSeen();
  return entries.some(
    e => (e.scope === scope || e.scope === 'shared') && isUnseenAgainst(e, last, entries),
  );
}

export function unseenIdsSnapshot(entries: ChangelogEntry[] = CHANGELOG): Set<string> {
  const last = readLastSeen();
  return new Set(entries.filter(e => isUnseenAgainst(e, last, entries)).map(e => e.id));
}

export function markScopeSeen(scope: DemoScope, entries: ChangelogEntry[] = CHANGELOG): void {
  const last = readLastSeen();
  const newScopeId = latestIdFor(scope, entries);
  const newSharedId = latestIdFor('shared', entries);
  if (newScopeId) last[scope] = newScopeId;
  if (newSharedId) last.shared = newSharedId;
  writeLastSeen(last);
}

/**
 * On a fresh browser (no stored value), silently set lastSeen to the latest id in each scope so
 * new users don't see a misleading dot for entries that pre-date them.
 */
export function initLastSeenIfMissing(entries: ChangelogEntry[] = CHANGELOG): void {
  if (localStorage.getItem(LAST_SEEN_KEY) !== null) return;
  const init: LastSeen = {};
  for (const s of new Set(entries.map(e => e.scope))) {
    const latest = latestIdFor(s, entries);
    if (latest) init[s] = latest;
  }
  writeLastSeen(init);
}
