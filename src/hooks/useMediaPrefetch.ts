import { useEffect, useRef } from 'react';

type FetchInitWithPriority = RequestInit & { priority?: 'high' | 'low' | 'auto' };

/**
 * Warms the browser HTTP cache for a set of media URLs -- the project demo
 * clips and their poster stills -- so a Project sheet opens with its video
 * already downloaded instead of buffering on click.
 *
 * Deliberately polite (preloading every clip on landing would waste data
 * for visitors who never open a project):
 *  - waits for the first user interaction (with a 6s fallback), so it never
 *    competes with first paint -- and because some browsers won't buffer
 *    media before a gesture anyway;
 *  - runs inside a requestIdleCallback slot;
 *  - skips entirely on Save-Data or a 2g-class connection;
 *  - fetches at low priority, two at a time, and never refetches a URL.
 *
 * Failures are swallowed -- worst case the <video> loads on open exactly as
 * it would without this. Pass a memoized `urls` array.
 */
export function useMediaPrefetch(urls: readonly string[]) {
  const fetched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending = urls.filter(u => u && !fetched.current.has(u));
    if (pending.length === 0) return;

    const conn = (
      navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || /(?:^|-)2g$/.test(conn?.effectiveType ?? '')) return;

    let cancelled = false;

    const warm = () => {
      const idle: (cb: () => void) => void =
        'requestIdleCallback' in window
          ? cb =>
              (window as unknown as {
                requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
              }).requestIdleCallback(cb, { timeout: 3000 })
          : cb => void window.setTimeout(cb, 300);

      idle(() => {
        const queue = urls.filter(u => u && !fetched.current.has(u));
        const worker = async () => {
          while (!cancelled) {
            const url = queue.shift();
            if (!url) return;
            fetched.current.add(url);
            const init: FetchInitWithPriority = {
              mode: 'no-cors',
              credentials: 'omit',
              priority: 'low',
            };
            try {
              await fetch(url, init);
            } catch {
              /* offline / blocked -- fine, the <video> will still try */
            }
          }
        };
        void Promise.all([worker(), worker()]);
      });
    };

    const events: (keyof WindowEventMap)[] = [
      'pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel',
    ];
    let fallback = 0;
    const onFirst = () => {
      window.clearTimeout(fallback);
      events.forEach(e => window.removeEventListener(e, onFirst));
      warm();
    };
    events.forEach(e => window.addEventListener(e, onFirst, { once: true, passive: true }));
    fallback = window.setTimeout(onFirst, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      events.forEach(e => window.removeEventListener(e, onFirst));
    };
  }, [urls]);
}
