import { useEffect, useState } from 'react';
import styles from './NavBar.module.css';

interface NavBarProps {
  active: 'elements' | 'pck' | 'pck-diff';
}

function getInitialTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function NavBar({ active }: NavBarProps) {
  const qs = location.search;
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function link(href: string) {
    return qs && !href.includes('?') ? href + qs : href;
  }

  return (
    <nav className={styles.nav}>
      <a href={link('../')} className={styles.home}>autoangel</a>
      <div className={styles.links}>
        <a
          href={link('../elements/')}
          className={`${styles.link}${active === 'elements' ? ` ${styles.active}` : ''}`}
        >
          Elements
        </a>
        <a
          href={link('../pck/')}
          className={`${styles.link}${active === 'pck' ? ` ${styles.active}` : ''}`}
        >
          PCK
        </a>
        <a
          href={link('../pck-diff/')}
          className={`${styles.link}${active === 'pck-diff' ? ` ${styles.active}` : ''}`}
        >
          Diff
        </a>
        <button
          className={styles.themeToggle}
          onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? '\u263E' : '\u2600'}
        </button>
      </div>
    </nav>
  );
}
