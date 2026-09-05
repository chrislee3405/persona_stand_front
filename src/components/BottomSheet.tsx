import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, RefObject } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
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
