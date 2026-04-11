import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { detectEncoding, decodeText } from '@shared/util/encoding';
import styles from '../App.module.css';

declare const Diff: {
  diffLines(a: string, b: string): Array<{ value: string; added?: boolean; removed?: boolean }>;
};

interface TextDiffProps {
  leftData: Uint8Array;
  rightData: Uint8Array;
  path: string;
  ext: string;
}

type DiffMode = 'unified' | 'side-by-side';

interface DiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}

function splitLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// --- Unified diff renderer ---

interface HunkSepProps {
  hiddenCount: number;
  hiddenLines: string[];
  startOld: number;
  startNew: number;
  onExpand: (sep: HTMLElement, hiddenLines: string[], startOld: number, startNew: number) => void;
}

// We render unified diff to a container div imperatively because collapsible hunks
// need to replace nodes in-place (insertBefore/replaceWith), which isn't natural in React.
function renderUnifiedDiffToContainer(
  changes: DiffChange[],
  container: HTMLDivElement,
) {
  container.innerHTML = '';

  function createDiffLine(type: string, oldNum: number | null, newNum: number | null, content: string): HTMLElement {
    const div = document.createElement('div');
    div.className = `${styles.diffLine} ${styles[`diffLine_${type}`] ?? ''}`;

    const gutterOld = document.createElement('span');
    gutterOld.className = styles.diffGutter;
    gutterOld.textContent = oldNum != null ? String(oldNum) : '';

    const gutterNew = document.createElement('span');
    gutterNew.className = styles.diffGutter;
    gutterNew.textContent = newNum != null ? String(newNum) : '';

    const code = document.createElement('span');
    code.className = styles.diffCode;
    code.textContent = content;

    div.append(gutterOld, gutterNew, code);
    return div;
  }

  function createHunkSep(hiddenCount: number, hiddenLines: string[], startOld: number, startNew: number): HTMLElement {
    const sep = document.createElement('div');
    sep.className = styles.diffHunkSep;
    sep.textContent = `\u22EF ${hiddenCount} unchanged lines`;
    sep.onclick = () => {
      const frag = document.createDocumentFragment();
      let ol = startOld, nl = startNew;
      for (const line of hiddenLines) {
        frag.appendChild(createDiffLine('context', ol, nl, line));
        ol++; nl++;
      }
      sep.replaceWith(frag);
    };
    return sep;
  }

  let oldLine = 1, newLine = 1;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = splitLines(change.value);
    const isFirst = i === 0;
    const isLast = i === changes.length - 1;

    if (change.added) {
      for (const line of lines) {
        container.appendChild(createDiffLine('added', null, newLine, line));
        newLine++;
      }
    } else if (change.removed) {
      for (const line of lines) {
        container.appendChild(createDiffLine('removed', oldLine, null, line));
        oldLine++;
      }
    } else {
      if (lines.length > 6 && !isFirst && !isLast) {
        for (let j = 0; j < 3; j++) {
          container.appendChild(createDiffLine('context', oldLine, newLine, lines[j]));
          oldLine++; newLine++;
        }
        const hiddenCount = lines.length - 6;
        container.appendChild(createHunkSep(hiddenCount, lines.slice(3, lines.length - 3), oldLine, newLine));
        oldLine += hiddenCount; newLine += hiddenCount;
        for (let j = lines.length - 3; j < lines.length; j++) {
          container.appendChild(createDiffLine('context', oldLine, newLine, lines[j]));
          oldLine++; newLine++;
        }
      } else if (lines.length > 6 && isFirst) {
        const hiddenCount = lines.length - 3;
        container.appendChild(createHunkSep(hiddenCount, lines.slice(0, hiddenCount), oldLine, newLine));
        oldLine += hiddenCount; newLine += hiddenCount;
        for (let j = hiddenCount; j < lines.length; j++) {
          container.appendChild(createDiffLine('context', oldLine, newLine, lines[j]));
          oldLine++; newLine++;
        }
      } else if (lines.length > 6 && isLast) {
        for (let j = 0; j < 3; j++) {
          container.appendChild(createDiffLine('context', oldLine, newLine, lines[j]));
          oldLine++; newLine++;
        }
        const hiddenCount = lines.length - 3;
        container.appendChild(createHunkSep(hiddenCount, lines.slice(3), oldLine, newLine));
        oldLine += hiddenCount; newLine += hiddenCount;
      } else {
        for (const line of lines) {
          container.appendChild(createDiffLine('context', oldLine, newLine, line));
          oldLine++; newLine++;
        }
      }
    }
  }
}

// --- Side-by-side diff renderer ---

function renderSideBySideDiffToContainer(
  changes: DiffChange[],
  leftCol: HTMLDivElement,
  rightCol: HTMLDivElement,
): () => void {
  leftCol.innerHTML = '';
  rightCol.innerHTML = '';

  function createSideLine(type: string, lineNum: number | null, content: string): HTMLElement {
    const div = document.createElement('div');
    div.className = `${styles.diffLine} ${styles[`diffLine_${type}`] ?? ''}`;
    const gutter = document.createElement('span');
    gutter.className = styles.diffGutterSide;
    gutter.textContent = lineNum != null ? String(lineNum) : '';
    const code = document.createElement('span');
    code.className = styles.diffCode;
    code.textContent = content;
    div.append(gutter, code);
    return div;
  }

  function createSideSep(
    hiddenCount: number,
    hiddenLines: string[],
    startOld: number,
    startNew: number,
    peerRef: { el: HTMLElement | null },
    side: 'left' | 'right',
  ): HTMLElement {
    const sep = document.createElement('div');
    sep.className = styles.diffHunkSep;
    sep.textContent = `\u22EF ${hiddenCount} unchanged lines`;
    sep.onclick = () => {
      const leftFrag = document.createDocumentFragment();
      const rightFrag = document.createDocumentFragment();
      let ol = startOld, nl = startNew;
      for (const line of hiddenLines) {
        leftFrag.appendChild(createSideLine('context', ol, line));
        rightFrag.appendChild(createSideLine('context', nl, line));
        ol++; nl++;
      }
      if (side === 'left') {
        sep.replaceWith(leftFrag);
        peerRef.el?.replaceWith(rightFrag);
      } else {
        sep.replaceWith(rightFrag);
        peerRef.el?.replaceWith(leftFrag);
      }
    };
    return sep;
  }

  let oldLine = 1, newLine = 1;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = splitLines(change.value);
    const isFirst = i === 0;
    const isLast = i === changes.length - 1;

    if (change.removed) {
      for (const line of lines) {
        leftCol.appendChild(createSideLine('removed', oldLine, line));
        rightCol.appendChild(createSideLine('blank', null, ''));
        oldLine++;
      }
    } else if (change.added) {
      for (const line of lines) {
        leftCol.appendChild(createSideLine('blank', null, ''));
        rightCol.appendChild(createSideLine('added', newLine, line));
        newLine++;
      }
    } else {
      const addContextBlock = (from: number, to: number, ol0: number, nl0: number) => {
        let ol = ol0, nl = nl0;
        for (let j = from; j < to; j++) {
          leftCol.appendChild(createSideLine('context', ol, lines[j]));
          rightCol.appendChild(createSideLine('context', nl, lines[j]));
          ol++; nl++;
        }
        return { ol, nl };
      };

      if (lines.length > 6 && !isFirst && !isLast) {
        let { ol, nl } = addContextBlock(0, 3, oldLine, newLine);
        oldLine = ol; newLine = nl;
        const hiddenCount = lines.length - 6;
        const hiddenLines = lines.slice(3, lines.length - 3);
        const sepOld = oldLine, sepNew = newLine;
        const leftPeer: { el: HTMLElement | null } = { el: null };
        const rightPeer: { el: HTMLElement | null } = { el: null };
        const leftSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, rightPeer, 'left');
        const rightSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, leftPeer, 'right');
        leftPeer.el = leftSep; rightPeer.el = rightSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
        const r2 = addContextBlock(lines.length - 3, lines.length, oldLine, newLine);
        oldLine = r2.ol; newLine = r2.nl;
      } else if (lines.length > 6 && isFirst) {
        const hiddenCount = lines.length - 3;
        const hiddenLines = lines.slice(0, hiddenCount);
        const sepOld = oldLine, sepNew = newLine;
        const leftPeer: { el: HTMLElement | null } = { el: null };
        const rightPeer: { el: HTMLElement | null } = { el: null };
        const leftSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, rightPeer, 'left');
        const rightSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, leftPeer, 'right');
        leftPeer.el = leftSep; rightPeer.el = rightSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
        const r2 = addContextBlock(hiddenCount, lines.length, oldLine, newLine);
        oldLine = r2.ol; newLine = r2.nl;
      } else if (lines.length > 6 && isLast) {
        let { ol, nl } = addContextBlock(0, 3, oldLine, newLine);
        oldLine = ol; newLine = nl;
        const hiddenCount = lines.length - 3;
        const hiddenLines = lines.slice(3);
        const sepOld = oldLine, sepNew = newLine;
        const leftPeer: { el: HTMLElement | null } = { el: null };
        const rightPeer: { el: HTMLElement | null } = { el: null };
        const leftSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, rightPeer, 'left');
        const rightSep = createSideSep(hiddenCount, hiddenLines, sepOld, sepNew, leftPeer, 'right');
        leftPeer.el = leftSep; rightPeer.el = rightSep;
        leftCol.appendChild(leftSep); rightCol.appendChild(rightSep);
        oldLine += hiddenCount; newLine += hiddenCount;
      } else {
        const r2 = addContextBlock(0, lines.length, oldLine, newLine);
        oldLine = r2.ol; newLine = r2.nl;
      }
    }
  }

  // Synchronized scrolling
  let syncing = false;
  const onLeftScroll = () => {
    if (syncing) return; syncing = true;
    rightCol.scrollTop = leftCol.scrollTop;
    syncing = false;
  };
  const onRightScroll = () => {
    if (syncing) return; syncing = true;
    leftCol.scrollTop = rightCol.scrollTop;
    syncing = false;
  };
  leftCol.addEventListener('scroll', onLeftScroll);
  rightCol.addEventListener('scroll', onRightScroll);

  return () => {
    leftCol.removeEventListener('scroll', onLeftScroll);
    rightCol.removeEventListener('scroll', onRightScroll);
  };
}

// --- TextDiff component ---

export function TextDiff({ leftData, rightData, path, ext }: TextDiffProps) {
  const [mode, setMode] = useState<DiffMode>('unified');
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);

  const { changes, leftEnc, rightEnc } = useMemo(() => {
    const le = detectEncoding(leftData);
    const re = detectEncoding(rightData);
    const lt = decodeText(leftData, le);
    const rt = decodeText(rightData, re);
    return { changes: Diff.diffLines(lt, rt), leftEnc: le, rightEnc: re };
  }, [leftData, rightData]);

  const renderDiff = useCallback((targetMode: DiffMode) => {
    if (!previewRef.current) return;

    // Clean up previous scroll listeners before re-rendering
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = null;

    if (targetMode === 'side-by-side') {
      const contentEl = previewRef.current.closest(`.${styles.previewArea}`) as HTMLElement | null;
      if (contentEl && contentEl.offsetWidth < 600) {
        // Too narrow — fall back to unified
        previewRef.current.style.padding = '';
        previewRef.current.style.overflow = '';
        const notice = document.createElement('div');
        notice.className = styles.placeholder;
        notice.textContent = 'Panel too narrow for side-by-side view. Showing unified diff instead.';
        const container = document.createElement('div');
        container.className = styles.diffView;
        previewRef.current.innerHTML = '';
        previewRef.current.append(notice, container);
        renderUnifiedDiffToContainer(changes, container as HTMLDivElement);
        return;
      }
      previewRef.current.style.padding = '0';
      previewRef.current.style.overflow = 'hidden';
      previewRef.current.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = styles.diffSideBySide;
      const leftCol = document.createElement('div');
      leftCol.className = styles.diffColumn;
      const rightCol = document.createElement('div');
      rightCol.className = styles.diffColumn;
      wrapper.append(leftCol, rightCol);
      previewRef.current.appendChild(wrapper);
      scrollCleanupRef.current = renderSideBySideDiffToContainer(changes, leftCol as HTMLDivElement, rightCol as HTMLDivElement);
    } else {
      previewRef.current.style.padding = '';
      previewRef.current.style.overflow = '';
      previewRef.current.innerHTML = '';
      const container = document.createElement('div');
      container.className = styles.diffView;
      previewRef.current.appendChild(container);
      renderUnifiedDiffToContainer(changes, container as HTMLDivElement);
    }
  }, [changes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    renderDiff(mode);
  }, [mode, renderDiff]);

  return (
    <div ref={containerRef} className={styles.textDiffWrapper}>
      <div className={styles.diffToggle} data-diff-toggle="1">
        <button
          className={`${styles.btn} ${mode === 'unified' ? styles.btnActive : ''}`}
          data-active={mode === 'unified' ? 'true' : 'false'}
          onClick={() => setMode('unified')}
        >
          Unified
        </button>
        <button
          className={`${styles.btn} ${mode === 'side-by-side' ? styles.btnActive : ''}`}
          data-active={mode === 'side-by-side' ? 'true' : 'false'}
          onClick={() => setMode('side-by-side')}
        >
          Side-by-side
        </button>
      </div>
      <div ref={previewRef} className={styles.textDiffPreview} />
    </div>
  );
}
