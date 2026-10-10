import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Reserve one line, expand the empty bubble, then reveal its contents. */
export function useBubbleEntrance(containerRef: RefObject<HTMLDivElement | null>, refresh: unknown) {
  const seen = useRef<Set<string> | null>(null);
  const active = useRef(new Map<HTMLElement, () => void>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'));
    const previous = seen.current;
    seen.current = new Set(rows.map(row => row.dataset.messageId!));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const row of rows) {
      if (!previous || previous.has(row.dataset.messageId!) || reduced) continue;
      const bubble = row.querySelector<HTMLElement>('.msg__bubble');
      if (!bubble) continue;
      const height = row.getBoundingClientRect().height;
      if (!height) continue;
      const style = getComputedStyle(bubble);
      const lineHeight = Math.min(height, parseFloat(style.lineHeight)
        + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth));
      const margin = parseFloat(getComputedStyle(row).marginTop) || 0;
      let frame = 0;
      let start: number | undefined;
      const finish = () => {
        cancelAnimationFrame(frame);
        row.classList.remove('msg--entering');
        row.style.removeProperty('height');
        row.style.removeProperty('margin-top');
        row.style.removeProperty('--bubble-content-opacity');
        active.current.delete(row);
      };
      active.current.set(row, finish);
      row.classList.add('msg--entering');
      row.style.height = '0px';
      row.style.marginTop = '0px';
      const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
      const tick = (now: number) => {
        start ??= now;
        const elapsed = now - start;
        if (!row.isConnected || elapsed >= 330) {
          finish();
          container.scrollTop = container.scrollHeight;
          return;
        }
        const reserve = ease(elapsed / 90);
        const expand = ease((elapsed - 90) / 160);
        row.style.height = `${lineHeight * reserve + (height - lineHeight) * expand}px`;
        row.style.marginTop = `${margin * reserve}px`;
        row.style.setProperty('--bubble-content-opacity', String(Math.max(0, (elapsed - 250) / 80)));
        container.scrollTop = container.scrollHeight;
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    container.scrollTop = container.scrollHeight;
  }, [containerRef, refresh]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const animations = active.current;
    if (!container) return;
    let width = container.clientWidth;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth === width) return;
      width = container.clientWidth;
      animations.forEach(finish => finish());
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      animations.forEach(finish => finish());
    };
  }, [containerRef]);
}
