import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Selector for things that can hold focus. `:not([tabindex="-1"])` on the
 * generic case only -- the panel itself is deliberately `tabIndex={-1}` so
 * focus can be moved onto it programmatically, and it must not become a
 * tab stop.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Makes a dialog actually modal for keyboard users.
 *
 * `role="dialog" aria-modal="true"` tells a SCREEN READER to ignore the
 * rest of the document. It does nothing whatsoever for a sighted keyboard
 * user: Tab still walks straight out of the panel and into the page
 * underneath, which is covered by a backdrop they cannot see past. Both
 * dialogs in this app had that problem -- four Tab presses from an open
 * project sheet landed on the "Skip to content" link -- and the consent
 * dialog additionally never received focus at all, leaving twelve of the
 * page's fourteen tab stops reachable while it was up.
 *
 * This hook does the three things the ARIA dialog pattern asks for and the
 * markup alone cannot:
 *  1. moves focus into the panel on open (first focusable, else the panel);
 *  2. cycles Tab / Shift+Tab within it;
 *  3. restores focus to whatever opened it on close -- so dismissing a
 *     sheet returns you to the card you opened it from, not the top of the
 *     document.
 *
 * Esc is NOT handled here. BottomSheet already owns Esc because it also
 * owns the scroll lock and the history entry that have to be unwound with
 * it; the consent dialog passes `onEscape` to get the same behaviour
 * without duplicating that.
 */
export function useFocusTrap(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Captured before focus moves, restored on cleanup.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        // A control inside a hidden branch of the panel is not a real stop.
        .filter(el => el.offsetParent !== null || el === document.activeElement);

    const first = focusables()[0];
    (first ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        // Nothing to cycle between: keep focus on the panel rather than
        // letting it escape to the page behind.
        e.preventDefault();
        panel.focus();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;

      // Wrap at both ends, and pull focus back in if it has somehow landed
      // outside the panel already.
      if (e.shiftKey) {
        if (current === firstItem || current === panel || !panel.contains(current)) {
          e.preventDefault();
          lastItem.focus();
        }
      } else if (current === lastItem || !panel.contains(current)) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only take focus back if it is still inside the panel we are
      // unmounting -- if something else has deliberately moved it, leave it.
      if (previouslyFocused && panel.contains(document.activeElement)) {
        previouslyFocused.focus?.();
      }
    };
  }, [panelRef, active, onEscape]);
}
