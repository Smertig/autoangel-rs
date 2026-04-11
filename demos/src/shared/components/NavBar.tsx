import styles from './NavBar.module.css';

interface NavBarProps {
  active: 'elements' | 'pck' | 'pck-diff';
}

export function NavBar({ active }: NavBarProps) {
  const qs = location.search;

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
      </div>
    </nav>
  );
}
