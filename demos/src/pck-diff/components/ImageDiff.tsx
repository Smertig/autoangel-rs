import React, { useEffect, useRef, useState } from 'react';
import { IMAGE_EXTENSIONS, CANVAS_IMAGE_EXTENSIONS, IMAGE_MIME, formatSize } from '@shared/util/files';
import { decodeToCanvas } from '@shared/util/canvas';
import type { AutoangelModule } from '@shared/../types/autoangel';
import styles from '../App.module.css';

type ImageCompareMode = 'Side-by-side' | 'Swipe' | 'Onion skin';

interface ImageInfo {
  el: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
}

interface ImageDiffProps {
  leftData: Uint8Array;
  rightData: Uint8Array;
  path: string;
  ext: string;
  wasm: AutoangelModule;
}

// Creates a clone of an image/canvas element for re-use
function cloneImageElement(info: ImageInfo): HTMLImageElement | HTMLCanvasElement {
  if (info.el instanceof HTMLCanvasElement) {
    const canvas = document.createElement('canvas');
    canvas.width = info.width;
    canvas.height = info.height;
    canvas.getContext('2d')!.drawImage(info.el, 0, 0);
    return canvas;
  }
  const img = new Image();
  img.src = (info.el as HTMLImageElement).src;
  return img;
}

async function createImageElement(
  data: Uint8Array,
  ext: string,
  wasm: AutoangelModule,
): Promise<ImageInfo> {
  if (CANVAS_IMAGE_EXTENSIONS.has(ext)) {
    const { canvas, width, height } = decodeToCanvas(data, ext, wasm.decodeDds, wasm.decodeTga);
    return { el: canvas, width, height };
  }

  const mime = IMAGE_MIME[ext];
  if (!mime) throw new Error(`Unknown image type: ${ext}`);
  const blob = new Blob([data.buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image`));
  });
  // URL is kept alive — caller is responsible for revoking on cleanup
  return { el: img, width: img.naturalWidth, height: img.naturalHeight };
}

// --- Side-by-side mode ---
function SideBySideView({
  leftImg,
  rightImg,
  leftData,
  rightData,
  fitToScreen,
}: {
  leftImg: ImageInfo;
  rightImg: ImageInfo;
  leftData: Uint8Array;
  rightData: Uint8Array;
  fitToScreen: boolean;
}) {
  const containerClass = [styles.imageCompare, fitToScreen ? '' : styles.realSize].filter(Boolean).join(' ');
  return (
    <div className={containerClass}>
      <div className={styles.imageSbs}>
        {([
          [leftImg, leftData, 'Old'] as const,
          [rightImg, rightData, 'New'] as const,
        ]).map(([img, data, title]) => (
          <div key={title} className={styles.imageSbsPanel}>
            <CanvasOrImage info={img} />
            <div className={styles.imageSbsLabel}>
              {title}: {img.width} &times; {img.height} ({formatSize(data.byteLength)})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CanvasOrImage({ info }: { info: ImageInfo }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const el = cloneImageElement(info);
    ref.current.appendChild(el);
  }, [info]);
  return <div ref={ref} />;
}

// --- Swipe mode ---
function SwipeView({
  leftImg,
  rightImg,
  fitToScreen,
}: {
  leftImg: ImageInfo;
  rightImg: ImageInfo;
  fitToScreen: boolean;
}) {
  const swipeRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!swipeRef.current) return;
    const swipe = swipeRef.current;
    swipe.innerHTML = '';

    const baseEl = cloneImageElement(leftImg);
    (baseEl as HTMLElement).style.display = 'block';
    (baseEl as HTMLElement).style.width = '100%';
    swipe.appendChild(baseEl);

    const overEl = cloneImageElement(rightImg);
    const overStyle = (overEl as HTMLElement).style;
    overStyle.position = 'absolute';
    overStyle.top = '0';
    overStyle.left = '0';
    overStyle.width = '100%';
    overStyle.height = '100%';
    overStyle.clipPath = 'inset(0 0 0 50%)';
    swipe.appendChild(overEl);
    overRef.current = overEl as HTMLElement;

    const divider = document.createElement('div');
    divider.className = styles.swipeDivider;
    swipe.appendChild(divider);
    dividerRef.current = divider;

    const labelLeft = document.createElement('div');
    labelLeft.className = `${styles.swipeLabel} ${styles.swipeLabelLeft}`;
    labelLeft.textContent = 'Old';
    swipe.appendChild(labelLeft);

    const labelRight = document.createElement('div');
    labelRight.className = `${styles.swipeLabel} ${styles.swipeLabelRight}`;
    labelRight.textContent = 'New';
    swipe.appendChild(labelRight);

    function updateSwipe(x: number) {
      const rect = swipe.getBoundingClientRect();
      const pxPos = Math.max(0, Math.min(x - rect.left, rect.width));
      const pct = (pxPos / rect.width) * 100;
      divider.style.left = pct + '%';
      (overEl as HTMLElement).style.clipPath = `inset(0 0 0 ${pct}%)`;
    }

    requestAnimationFrame(() => {
      updateSwipe(swipe.getBoundingClientRect().left + swipe.offsetWidth / 2);
    });

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      updateSwipe(e.clientX);
      const onMove = (ev: MouseEvent) => updateSwipe(ev.clientX);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      updateSwipe(e.touches[0].clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      updateSwipe(e.touches[0].clientX);
    };

    swipe.addEventListener('mousedown', handleMouseDown);
    swipe.addEventListener('touchstart', handleTouchStart, { passive: false });
    swipe.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      swipe.removeEventListener('mousedown', handleMouseDown);
      swipe.removeEventListener('touchstart', handleTouchStart);
      swipe.removeEventListener('touchmove', handleTouchMove);
    };
  }, [leftImg, rightImg]);

  const containerClass = [styles.imageCompare, fitToScreen ? '' : styles.realSize].filter(Boolean).join(' ');
  return (
    <div className={containerClass}>
      <div ref={swipeRef} className={styles.imageSwipe} />
    </div>
  );
}

// --- Onion skin mode ---
function OnionView({
  leftImg,
  rightImg,
  fitToScreen,
}: {
  leftImg: ImageInfo;
  rightImg: ImageInfo;
  fitToScreen: boolean;
}) {
  const onionRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement | null>(null);
  const [opacity, setOpacity] = useState(50);

  useEffect(() => {
    if (!onionRef.current) return;
    const onion = onionRef.current;
    onion.innerHTML = '';

    const baseEl = cloneImageElement(leftImg);
    onion.appendChild(baseEl);

    const topEl = cloneImageElement(rightImg);
    const topStyle = (topEl as HTMLElement).style;
    topStyle.position = 'absolute';
    topStyle.top = '0';
    topStyle.left = '0';
    topStyle.width = '100%';
    topStyle.height = '100%';
    topStyle.objectFit = 'contain';
    topStyle.opacity = String(opacity / 100);
    onion.appendChild(topEl);
    topRef.current = topEl as HTMLElement;
  }, [leftImg, rightImg]);

  useEffect(() => {
    if (topRef.current) {
      topRef.current.style.opacity = String(opacity / 100);
    }
  }, [opacity]);

  const containerClass = [styles.imageCompare, fitToScreen ? '' : styles.realSize].filter(Boolean).join(' ');
  return (
    <div className={containerClass}>
      <div ref={onionRef} className={styles.imageOnion} />
      <div className={styles.imageOnionSlider}>
        <span className={`${styles.onionLabel} ${styles.onionLabelRight}`}>Old</span>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
        />
        <span className={styles.onionLabel}>Opacity: {opacity}%</span>
        <span className={styles.onionLabel}>New</span>
      </div>
    </div>
  );
}

// --- Main ImageDiff component ---

export function ImageDiff({ leftData, rightData, path, ext, wasm }: ImageDiffProps) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; leftImg: ImageInfo; rightImg: ImageInfo }
  >({ kind: 'loading' });

  const [mode, setMode] = useState<ImageCompareMode>('Side-by-side');
  const [fitToScreen, setFitToScreen] = useState(true);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const urlsBefore = blobUrlsRef.current;
    blobUrlsRef.current = [];

    Promise.all([
      createImageElement(leftData, ext, wasm),
      createImageElement(rightData, ext, wasm),
    ]).then(([leftImg, rightImg]) => {
      if (cancelled) {
        // Revoke URLs created during a cancelled run
        if (leftImg.el instanceof HTMLImageElement) URL.revokeObjectURL((leftImg.el as HTMLImageElement).src);
        if (rightImg.el instanceof HTMLImageElement) URL.revokeObjectURL((rightImg.el as HTMLImageElement).src);
        return;
      }
      // Collect blob URLs for cleanup
      if (leftImg.el instanceof HTMLImageElement) blobUrlsRef.current.push((leftImg.el as HTMLImageElement).src);
      if (rightImg.el instanceof HTMLImageElement) blobUrlsRef.current.push((rightImg.el as HTMLImageElement).src);
      setState({ kind: 'ready', leftImg, rightImg });
    }).catch((e: unknown) => {
      if (cancelled) return;
      setState({ kind: 'error', message: `Failed to decode image: ${e instanceof Error ? e.message : String(e)}` });
    });

    return () => {
      cancelled = true;
      for (const url of urlsBefore) URL.revokeObjectURL(url);
    };
  }, [leftData, rightData, ext]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  if (state.kind === 'loading') return <div className={styles.placeholder}>Loading images&hellip;</div>;
  if (state.kind === 'error') return <div className={styles.placeholder}>{state.message}</div>;

  const { leftImg, rightImg } = state;
  const sameDimensions = leftImg.width === rightImg.width && leftImg.height === rightImg.height;

  const activeMode = (!sameDimensions && (mode === 'Swipe' || mode === 'Onion skin'))
    ? 'Side-by-side'
    : mode;

  const modes: ImageCompareMode[] = ['Side-by-side', 'Swipe', 'Onion skin'];

  return (
    <>
      <div className={styles.imageDiffHeader}>
        <div className={styles.imageCompareTabs}>
          {modes.map((m) => {
            const needsSameSize = m === 'Swipe' || m === 'Onion skin';
            const disabled = needsSameSize && !sameDimensions;
            return (
              <button
                key={m}
                className={`${styles.btn} ${activeMode === m ? styles.btnActive : ''}`}
                disabled={disabled}
                title={disabled ? 'Requires images of the same size' : undefined}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            );
          })}
        </div>
        <button
          className={`${styles.btn} ${styles.btnSmall}`}
          onClick={() => setFitToScreen(f => !f)}
        >
          {fitToScreen ? 'Real size' : 'Fit to screen'}
        </button>
      </div>

      {activeMode === 'Side-by-side' && (
        <SideBySideView
          leftImg={leftImg}
          rightImg={rightImg}
          leftData={leftData}
          rightData={rightData}
          fitToScreen={fitToScreen}
        />
      )}
      {activeMode === 'Swipe' && (
        <SwipeView leftImg={leftImg} rightImg={rightImg} fitToScreen={fitToScreen} />
      )}
      {activeMode === 'Onion skin' && (
        <OnionView leftImg={leftImg} rightImg={rightImg} fitToScreen={fitToScreen} />
      )}
    </>
  );
}
