import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Reveal the latest turn as the mobile keyboard opens and the composer grows. */
export function useComposerAutoScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  composerRef: RefObject<HTMLTextAreaElement | null>,
) {
  useLayoutEffect(() => {
    const log = scrollRef.current;
    const composer = composerRef.current;
    if (!log || !composer) return;
    const mobile = window.matchMedia(
      '(max-width: 767px), (max-width: 1024px) and (max-height: 500px)',
    );
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (mobile.matches && document.activeElement === composer) {
          log.scrollTop = log.scrollHeight;
        }
      });
    };
    // ResizeObserver runs after the viewport hook has resized the shell. This
    // avoids scrolling against the old log height halfway through keyboard opening.
    let height = log.clientHeight;
    const observer = new ResizeObserver(() => {
      if (height === log.clientHeight) return;
      height = log.clientHeight;
      schedule();
    });
    observer.observe(log);
    composer.addEventListener('focus', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      composer.removeEventListener('focus', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [scrollRef, composerRef]);
}
