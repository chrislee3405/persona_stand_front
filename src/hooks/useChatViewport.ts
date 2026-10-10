import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Keep the mobile chat shell inside the area above browser UI and the keyboard. */
export function useChatViewport(ref: RefObject<HTMLDivElement | null>, active: boolean) {
  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const shell = ref.current;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    root.classList.add('chat-route-open');
    let frame = 0;

    const update = () => {
      shell.style.setProperty('--chat-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      shell.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);

    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.classList.remove('chat-route-open');
      shell.style.removeProperty('--chat-viewport-height');
      shell.style.removeProperty('--chat-viewport-top');
    };
  }, [active, ref]);
}
