import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

/**
 * The modal bottom-sheet shell shared by the Journey and Project pop-ups:
 * a portalled full-screen layer, a dimmed backdrop that closes on click, a
 * panel that slides up from the bottom edge, the corner ✕, and the drag
 * grip bar.
 *
 * It also owns the two behaviours both sheets need and previously
 * implemented identically:
 *  - Esc closes, body scroll is locked while open, and focus moves into
 *    the panel;
 *  - the scroll area snaps back to the top on each open (the panel stays
 *    mounted between items so it doesn't blank during the close
 *    animation, which means it would otherwise keep the previous item's
 *    scroll position).
 *
 * The scroll element is rendered here but its ref belongs to the caller,
 * so a sheet that needs to observe its own scroll area can -- ProjectSheet
 * uses it as the IntersectionObserver root for one-video-at-a-time
 * playback.
 */
export default function BottomSheet({
  open,
  onClose,
  labelledBy,
  scrollRef,
  rootClassName = 'jsheet',
  panelClassName,
  barClassName,
  scrollClassName,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the heading inside `children` that names this dialog. */
  labelledBy: string;
  /** Owned by the caller so it can observe/measure the scroll area. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Root layer classes -- `jsheet` alone, or `jsheet psheet` to pull in
   *  the project sheet's wider panel rules. */
  rootClassName?: string;
  panelClassName: string;
  barClassName: string;
  scrollClassName: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [open, scrollRef]);

  // Moves focus in on open, cycles Tab inside the panel, and restores focus
  // to the card that opened the sheet on close. Without this the panel was
  // `aria-modal` in name only -- four Tab presses walked out of an open
  // sheet and onto the skip link, behind a backdrop the visitor cannot see
  // past. Esc stays below, with the scroll lock it has to be unwound with.
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  /**
   * Make the browser's Back button close the sheet.
   *
   * Opening a sheet pushes one history entry; Back pops it and we close.
   * Closing any other way (Esc, the ✕, the backdrop) pops that entry back
   * off, so the sheet never leaves a dead step behind in the history.
   *
   * Without this, Back from an open sheet left the site entirely -- the
   * behaviour phone users least expect, since a full-screen panel reads
   * as a page. Deliberately a bare `pushState` rather than a router
   * navigation: the sheet is not a route, and pushing one would unmount
   * the page underneath it.
   */
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ sheet: true }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by something other than Back -- drop the entry we added, so
      // Back still goes where the visitor came from.
      if (window.history.state?.sheet) window.history.back();
    };
  }, [open, onClose]);

  return createPortal(
    <div className={`${rootClassName}${open ? ' jsheet--open' : ''}`} aria-hidden={!open}>
      <div className="jsheet__backdrop" onClick={onClose} />
      <div
        className={panelClassName}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button
          type="button"
          className="sheet-close"
          aria-label="Close"
          onClick={onClose}
        />
        <div className={barClassName}>
          <span className="jsheet__grip" aria-hidden="true" />
        </div>
        <div className={scrollClassName} ref={scrollRef}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
