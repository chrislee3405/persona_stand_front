import { useEffect, useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Horizontal extent of an element's rendered text: the leftmost line start
 *  to the rightmost line end, and how many distinct lines it spans. */
function measureText(el: Element): { width: number; lines: number } | null {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects()).filter(r => r.width > 0);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  const lines = new Set(rects.map(r => Math.round(r.top))).size;
  return { width: right - left, lines };
}

/**
 * Fits every bubble in `container` to its longest line.
 *
 * Batched so the whole pass costs one layout, however many bubbles there
 * are: clear every previous fit (writes), measure them all (reads), then
 * apply (writes).
 */
function fitBubbles(container: HTMLElement) {
  const bubbles = Array.from(container.querySelectorAll<HTMLElement>('.msg__bubble'));
  bubbles.forEach(b => { b.style.width = ''; });

  const fits = bubbles.map(bubble => {
    const text = bubble.querySelector('.msg__text');
    const measured = text && measureText(text);
    // One line already shrink-wraps correctly; only a wrapped bubble is
    // stretched to its max-width.
    if (!measured || measured.lines < 2) return null;
    const note = bubble.querySelector('.msg__blocked-note');
    const noteWidth = note ? measureText(note)?.width ?? 0 : 0;
    const cs = getComputedStyle(bubble);
    const chrome =
      parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) +
      parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    // +1px so sub-pixel rounding can never push the longest line to wrap.
    const target = Math.ceil(Math.max(measured.width, noteWidth) + chrome) + 1;
    return target < bubble.getBoundingClientRect().width - 1 ? target : null;
  });

  bubbles.forEach((b, i) => {
    const target = fits[i];
    if (target !== null) b.style.width = `${target}px`;
  });
}

/**
 * Shrinks wrapped chat bubbles to their longest line.
 *
 * CSS cannot do this on its own. A box whose text wraps takes the full width
 * it was allowed (the bubble's max-width), not the width of its longest
 * line -- so a two-line message showed a wide empty strip beside its text,
 * very visible on the blue outgoing bubbles. The bubble's text must sit in a
 * `.msg__text` element; a `.msg__blocked-note` is counted too, so a bubble is
 * never narrower than its "Not sent" note.
 *
 * Narrowing a box to exactly its longest line never changes where the lines
 * break, so heights (and the scroll position) are unaffected.
 *
 * Re-fits when `refresh` changes (pass the messages array) and whenever the
 * panel's width changes, since that changes where every bubble wraps.
 */
export function useShrinkWrapBubbles(
  containerRef: RefObject<HTMLElement | null>,
  refresh?: unknown,
) {
  // Layout effect: the fit lands before paint, so a new bubble never shows
  // one frame at full width first.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) fitBubbles(container);
  }, [containerRef, refresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastWidth = container.clientWidth;
    const ro = new ResizeObserver(() => {
      // Only a width change moves line breaks; the panel growing taller as
      // messages arrive must not trigger a re-fit of every bubble.
      if (container.clientWidth === lastWidth) return;
      lastWidth = container.clientWidth;
      fitBubbles(container);
    });
    ro.observe(container);

    // Measured before the web font arrives, a line is sized in the fallback
    // face and would wrap once Inter swaps in. Re-fit when fonts are ready.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) fitBubbles(container);
    });

    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [containerRef]);
}
