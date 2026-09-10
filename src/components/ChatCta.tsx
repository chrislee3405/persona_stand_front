import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSiteContent } from '../hooks/useSiteContent';
import robotIcon from '../assets/icons/chatbot.png';

/** How long the hint stays up before fading on its own. */
const HINT_MS = 5000;

/**
 * How far the page must scroll to dismiss the hint. Not zero: a trackpad
 * or a restored scroll position can fire a scroll event of a pixel or two
 * without the visitor having done anything, and the hint would vanish
 * before it was read.
 */
const HINT_DISMISS_SCROLL = 24;

/**
 * The About-section chat entry point: the persona's own icon sitting
 * beside the owner's name, with a one-off hint bubble inviting a visitor
 * to try it.
 *
 * This replaced a full-width "Chat with my AI persona" button. The icon
 * is the same mark the floating launcher uses, so the thing you press at
 * the top of the page and the thing that follows you down it are visibly
 * the same object.
 *
 * It carries `data-chat-cta`, which is the hook <ChatLauncher> watches:
 * the floating button stays hidden while this one is on screen and takes
 * over as it scrolls away. Moving that attribute elsewhere silently
 * breaks the handover.
 *
 * The hint waits for the site content, then dismisses on a timer OR on
 * the first real scroll, whichever comes first, and never returns for the
 * rest of the visit -- an invitation that keeps reappearing is nagging,
 * not helpful.
 */
export default function ChatCta({ href, label }: { href: string; label: string }) {
  // The hint is held back until the page has something to say.
  //
  // While the fetch is in flight there is no owner name, so the name row
  // is just this icon; About is still its loading shell, which puts that
  // row in the second column, vertically centred. The bubble was opening
  // there and wagging in the middle of an otherwise empty screen, before
  // the visitor had seen a single word of the site -- and then the whole
  // section was replaced by <HeroBand> and the icon jumped away from
  // under it. An invitation is only an invitation once there is a page to
  // be invited from.
  const { loading } = useSiteContent();

  // Don't offer it at all if the page is already scrolled when we mount
  // (a restored position, or a deep link to a section) -- the visitor is
  // past the introduction. Scrolling DURING the fetch counts too: the
  // listener below runs from mount, so the hint simply never opens.
  const [dismissed, setDismissed] = useState(() => window.scrollY > HINT_DISMISS_SCROLL);
  const hintOpen = !loading && !dismissed;

  const btnRef = useRef<HTMLAnchorElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);

  /**
   * Place the bubble and point its tail at the icon.
   *
   * The bubble is sized to its text and would sit just right of the
   * icon -- but the icon's position depends on how long the owner's name
   * is, so on a narrow screen it can end up too far right for the bubble
   * to fit. Rather than stretching the bubble across the row (which left
   * a short label swimming in empty space) or flipping it leftwards
   * (which only moves the overflow when the name is short), it SHIFTS:
   * it keeps its content width and slides left only as far as it must to
   * stay inside the row. Text wraps only if it cannot fit even then.
   *
   * All of that needs the icon's x and the bubble's own width, neither of
   * which CSS can reason about, so it is measured here: two inline styles
   * and one custom property, recomputed on resize.
   *
   * Positions are row-relative -- .chat-cta is `position: static` so the
   * bubble's containing block is .about__namerow, whose width is exactly
   * the space available.
   */
  useLayoutEffect(() => {
    if (!hintOpen) return;

    const place = () => {
      const btn = btnRef.current;
      const hint = hintRef.current;
      if (!btn || !hint) return;
      const row = hint.offsetParent as HTMLElement | null;
      if (!row) return;

      const rowRect = row.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      if (rowRect.width === 0) return;

      // Never wider than the row, and never a single very long line on a
      // wide screen. Set before measuring, so the width we read is the
      // width it will actually render at.
      hint.style.maxWidth = `${Math.round(Math.min(rowRect.width, 260))}px`;
      const width = hint.offsetWidth;

      const iconCentre = btnRect.left + btnRect.width / 2 - rowRect.left;
      // Sit just right of the icon's centre, then pull left if that would
      // hang the bubble off the end of the row.
      const left = Math.max(0, Math.min(iconCentre + 4, rowRect.width - width));
      hint.style.left = `${Math.round(left)}px`;

      const inset = 14;   // keeps the tail clear of the corner radius
      const tail = Math.max(inset, Math.min(iconCentre - left, width - inset));
      hint.style.setProperty('--tail-x', `${Math.round(tail)}px`);
    };

    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [hintOpen]);

  // Watching for a scroll starts at mount, not when the bubble opens, so
  // a visitor who is already moving down the page while the content
  // loads never gets it thrown in front of them.
  useEffect(() => {
    if (dismissed) return;
    const onScroll = () => {
      if (window.scrollY > HINT_DISMISS_SCROLL) setDismissed(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [dismissed]);

  // The five seconds are counted from when it actually opens, which is
  // now the moment the content lands rather than the moment we mounted.
  useEffect(() => {
    if (!hintOpen) return;
    const timer = window.setTimeout(() => setDismissed(true), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hintOpen]);

  return (
    <span className="chat-cta">
      <NavLink ref={btnRef} className="chat-cta__btn" to={href} aria-label={label} data-chat-cta>
        <img src={robotIcon} alt="" aria-hidden="true" />
      </NavLink>

      {/* A hint, not a control: no focus, no dismiss button, and hidden
          from assistive tech, which already gets the same invitation from
          the link's own aria-label. Kept mounted so it can fade rather
          than vanish. */}
      <span
        ref={hintRef}
        className={`chat-cta__hint${hintOpen ? '' : ' is-gone'}`}
        aria-hidden="true"
      >
        {label}
      </span>
    </span>
  );
}
