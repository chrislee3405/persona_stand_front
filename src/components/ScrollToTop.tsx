import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router keeps the previous scroll position across route changes. When
 * the visitor taps the Home-page CTA to open the chatroom, the page stays
 * scrolled where it was, so the chatroom mounts parked mid-scroll with its
 * header hidden under the sticky navbar (most visible on a phone, where the
 * Home page is long).
 *
 * Reset to the top whenever the PATH changes -- but skip a hash-only change
 * so the Home page's own "/#section" anchor scrolling still lands on the
 * right section.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
