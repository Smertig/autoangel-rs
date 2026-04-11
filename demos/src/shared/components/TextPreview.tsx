import React, { useEffect, useMemo, useRef } from 'react';
import { detectEncoding, decodeText } from '@shared/util/encoding';
import { ENCODINGS, HLJS_LANG } from '@shared/util/files';
import styles from './TextPreview.module.css';

declare const hljs: { highlightElement(el: HTMLElement): void } | undefined;

interface TextPreviewProps {
  data: Uint8Array;
  ext: string;
  encoding?: string;
  onEncodingChange?: (enc: string) => void;
  showEncodingSelector?: boolean;
}

export function TextPreview({
  data,
  ext,
  encoding = 'auto',
  onEncodingChange,
  showEncodingSelector = true,
}: TextPreviewProps) {
  const codeRef = useRef<HTMLElement>(null);

  const { text, detected } = useMemo(() => {
    const det = detectEncoding(data);
    const resolved = encoding === 'auto' ? det : encoding;
    return { text: decodeText(data, resolved), detected: det };
  }, [data, encoding]);
  const lang = HLJS_LANG[ext];

  useEffect(() => {
    const el = codeRef.current;
    if (!el || !lang || typeof hljs === 'undefined') return;
    // Defer highlighting so unhighlighted text paints immediately
    const id = requestAnimationFrame(() => {
      el.removeAttribute('data-highlighted');
      hljs.highlightElement(el);
    });
    return () => cancelAnimationFrame(id);
  }, [text, lang]);

  return (
    <div className={styles.textPreview}>
      {showEncodingSelector && (
        <div className={styles.encodingBar}>
          <span className={styles.encodingLabel}>Encoding:</span>
          <select
            className={styles.encodingSelect}
            value={encoding}
            onChange={e => onEncodingChange?.(e.target.value)}
          >
            {ENCODINGS.map(enc => (
              <option key={enc} value={enc}>
                {enc === 'auto' ? `auto (${detected})` : enc}
              </option>
            ))}
          </select>
        </div>
      )}
      <pre className={styles.pre}>
        <code
          ref={codeRef}
          className={lang ? `language-${lang}` : undefined}
        >
          {text}
        </code>
      </pre>
    </div>
  );
}
