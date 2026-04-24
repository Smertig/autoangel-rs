// On-demand loader for highlight.js. Was previously loaded via 7 blocking
// <script> tags in pck/index.html and pck-diff/index.html — 125 kB + 6
// language bundles sat on the cold-path critical budget even for users who
// never open a text file.

export interface Hljs {
  highlightElement(el: HTMLElement): void;
}

const CDN = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build';
const LANGUAGES = ['ini', 'xml', 'json', 'lua', 'python', 'glsl'];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let cache: Promise<Hljs> | null = null;

export function ensureHljs(): Promise<Hljs> {
  if (cache) return cache;
  const existing = (window as unknown as { hljs?: Hljs }).hljs;
  if (existing) {
    cache = Promise.resolve(existing);
    return cache;
  }
  cache = (async () => {
    await loadScript(`${CDN}/highlight.min.js`);
    await Promise.all(LANGUAGES.map((l) => loadScript(`${CDN}/languages/${l}.min.js`)));
    return (window as unknown as { hljs: Hljs }).hljs;
  })();
  return cache;
}
