import { useEffect } from 'react';

/**
 * Click-and-drag horizontal panning for a scroll container -- mouse only
 * (touch devices already swipe natively). Lets the native scrollbar be
 * hidden without losing a way to scroll on a PC.
 *
 * While a real drag is happening (pointer moved past a small threshold) the
 * element gets an `is-dragging` class -- use it to swap the cursor to
 * `grabbing` and drop child `pointer-events` so hover states don't flicker.
 * The click the browser fires at the end of a drag is swallowed so it
 * doesn't open a project sheet; a plain click (no drag) goes through
 * untouched.
 */
export function useDragScroll(
  ref: React.RefObject<HTMLElement | null>,
  /**
   * Any value that changes once `ref` actually has its element -- e.g. an
   * item count that goes 0 -> N when data loads. Without it the effect
   * runs only on mount, before a conditionally-rendered scroller exists.
   */
  refresh?: unknown,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;
    let moved = false;
    let suppressClick = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragging = true;
      moved = false;
      suppressClick = false;
      startX = e.clientX;
      startScrollLeft = el.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        el.classList.add('is-dragging');
      }
      if (moved) el.scrollLeft = startScrollLeft - dx;
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('is-dragging');
      if (moved) suppressClick = true;
    };

    // Capture phase: eat the post-drag click before it reaches a card.
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        suppressClick = false;
      }
    };

    const cancelNativeDrag = (e: Event) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('dragstart', cancelNativeDrag);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('dragstart', cancelNativeDrag);
    };
  }, [ref, refresh]);
}
