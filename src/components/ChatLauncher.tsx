import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { hasVisitedChat } from '../lib/chatVisited';
// The robot itself is the opaque white shape here, on a transparent
// ground -- so the button's own background colour is what shows around
// it. (The original export had this inverted: an opaque white disc with
// the robot knocked out, which on a coloured button renders as a white
// circle with a coloured robot.)
import robotIcon from '../assets/icons/chatbot.png';

/** Where the launcher goes. Same route the About-section CTA defaults to. */
const CHATROOM_PATH = '/chatroom';

/** The About-section CTA this button hands over from (see Home.tsx). */
const CTA_SELECTOR = '[data-chat-cta]';

/**
 * How early the handover happens, as an inset on the TOP of the viewport.
 * The CTA counts as "gone" once it rises within this much of the top, so
 * the launcher arrives while the CTA is technically still on screen --
 * "about to disappear" rather than "disappeared". Roughly the height of
 * the sticky navbar, so the swap lands as the CTA slides under the bar.
 */
const HANDOVER_INSET = '96px';

/**
 * The button's name -- read out by screen readers, and shown as the text
 * of the introduction bubble. One constant for both, so the spoken and
 * the printed label can never drift apart.
 */
const LAUNCHER_LABEL = 'Chat with my virtual persona';

/** How long the button wags for before the bubble opens. */
const WAG_MS = 1000;

/** How long the bubble then stays up before fading away on its own. */
const HINT_MS = 2000;

/**
 * The floating chat button, pinned to the bottom-right of the viewport on
 * every page except the chatroom itself.
 *
 * It stays hidden while the About-section CTA is on screen, because the
 * two do exactly the same thing and showing both is noise -- worse, on a
 * phone the launcher lands right on top of that button. As the CTA
 * scrolls away the launcher takes over, flowing in from the CTA's
 * direction so the handover reads as one button becoming the other.
 * From Projects downwards it is the only route to the chatroom.
 *
 * A react-router <Link>, not an <a href>: a plain anchor would reload the
 * whole bundle to change route.
 *
 * Rendered by RootLayout, so it sits outside the page container and its
 * fixed position is relative to the viewport rather than any transformed
 * ancestor.
 */
export default function ChatLauncher() {
  const { pathname } = useLocation();

  // Start hidden: on Home the CTA is on screen at the top of the page, so
  // showing first and hiding once the observer reports would flash.
  const [hidden, setHidden] = useState(true);

  // ---- One-off introduction -------------------------------------------
  // A visitor who has scrolled past the About CTA has left the only
  // signpost to the chatroom behind them, so the first time this orange
  // circle turns up it introduces itself: a one-second wag, two seconds
  // of label, then out of the way.
  //
  // Decided ONCE at mount rather than read on every render: the answer
  // must not change under the component while the sequence is mid-flight
  // (the visitor could open the chatroom in a second tab), and anyone who
  // has already been there does not need telling what the button is.
  const [introWanted] = useState(() => !hasVisitedChat());
  const [phase, setPhase] = useState<'wag' | 'hint' | 'done'>('wag');
  // Armed by the button's FIRST appearance and never again, so scrolling
  // back and forth past the handover cannot replay it.
  const armed = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // The launcher isn't rendered on the chatroom route, so there is
    // nothing to observe.
    if (pathname === CHATROOM_PATH) return;

    // The CTA is in the document by now: effects run after the commit
    // that mounted the page, and About renders it unconditionally.
    //
    // This used to be wrapped in a body-wide MutationObserver, because
    // Home rendered a plain <section> until the content fetch landed and
    // then swapped in <HeroBand> -- destroying the button mid-load. An
    // IntersectionObserver on a detached node stops reporting silently,
    // so the launcher froze in whatever state it was in and worked only
    // until the content arrived. About is now one unconditional
    // <HeroBand> whose photo fills in later, so the node is stable for
    // the life of the route and the observer is unnecessary. If the
    // About section is ever made to mount a different element again,
    // this breaks the same silent way.
    const cta = document.querySelector(CTA_SELECTOR);

    let io: IntersectionObserver | null = null;
    if (cta) {
      io = new IntersectionObserver(
        ([entry]) => setHidden(entry.isIntersecting),
        // Only the top edge is inset -- the CTA leaves upwards as the page
        // scrolls down. threshold 0: react the moment it clears the line.
        { rootMargin: `-${HANDOVER_INSET} 0px 0px 0px`, threshold: 0 },
      );
      io.observe(cta);
    }

    // A route with no CTA at all: nothing to hand over from, so the
    // launcher is simply always on. (Not a bare setHidden() here -- a
    // synchronous setState in an effect body cascades a render.)
    const raf = cta ? null : requestAnimationFrame(() => setHidden(false));

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, [pathname]);

  // Arm the introduction the moment the button first becomes visible.
  //
  // Nothing is set synchronously here: 'wag' is already the opening phase
  // and the wag class is derived from `hidden` below, so the animation
  // starts in the very paint that reveals the button -- no extra render,
  // and no cascading setState for the lint rule to object to. Only the
  // two later steps need timers.
  useEffect(() => {
    if (hidden || armed.current || !introWanted) return;
    armed.current = true;
    timers.current = [
      window.setTimeout(() => setPhase('hint'), WAG_MS),
      window.setTimeout(() => setPhase('done'), WAG_MS + HINT_MS),
    ];
  }, [hidden, introWanted]);

  // Cleared on unmount only -- deliberately NOT when `hidden` flips.
  // Scrolling back up mid-sequence hides the button (and the bubble with
  // it, being its child), but it must not strand the timeline half-run
  // and leave behind a bubble whose closing step never fires.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  // Nothing to launch when you are already there. After the hooks, never
  // before -- an early return above them would change the hook order.
  if (pathname === CHATROOM_PATH) return null;

  const wagging = introWanted && !hidden && phase === 'wag';

  return (
    <Link
      to={CHATROOM_PATH}
      className={`chat-launcher${hidden ? ' is-hidden' : ''}${wagging ? ' is-wagging' : ''}`}
      aria-label={LAUNCHER_LABEL}
      // Kept out of the tab order and off the a11y tree while it is the
      // CTA's turn, so keyboard users don't land on an invisible control.
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      {/* The name is on the link via aria-label, so the image itself is
          decorative -- described twice otherwise. */}
      <img src={robotIcon} alt="" aria-hidden="true" />
      {/* In the DOM only for a visitor who is getting the introduction.
          aria-hidden because it repeats the link's own aria-label word
          for word; pointer-events are off in CSS so it can never swallow
          a tap meant for the circle. */}
      {introWanted && (
        <span
          className={`chat-launcher__hint${phase === 'hint' ? '' : ' is-gone'}`}
          aria-hidden="true"
        >
          {LAUNCHER_LABEL}
        </span>
      )}
    </Link>
  );
}
