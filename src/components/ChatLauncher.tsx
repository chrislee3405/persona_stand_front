import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

  useEffect(() => {
    // The launcher isn't rendered on the chatroom route, so there is
    // nothing to observe -- and that page churns the DOM as messages
    // arrive, which the MutationObserver below would needlessly chew on.
    if (pathname === CHATROOM_PATH) return;

    let io: IntersectionObserver | null = null;
    let watched: Element | null = null;

    /**
     * Point the observer at whichever CTA is currently in the document.
     * Re-callable: passing the element it is already on is a no-op, and
     * passing null means there is no CTA here so the launcher just shows.
     */
    const attach = (cta: Element | null) => {
      if (cta === watched) return;
      io?.disconnect();
      io = null;
      watched = cta;
      if (!cta) {
        setHidden(false);
        return;
      }
      io = new IntersectionObserver(
        ([entry]) => setHidden(entry.isIntersecting),
        // Only the top edge is inset -- the CTA leaves upwards as the page
        // scrolls down. threshold 0: react the moment it clears the line.
        { rootMargin: `-${HANDOVER_INSET} 0px 0px 0px`, threshold: 0 },
      );
      io.observe(cta);
    };

    // Home REPLACES the whole About subtree when the content fetch lands:
    // with no hero image it renders a plain <section>, and once the image
    // resolves it swaps in <HeroBand>. That destroys the button we were
    // observing, and an IntersectionObserver on a detached node simply
    // stops reporting -- which left the launcher frozen in whatever state
    // it happened to be in, working only until the content loaded.
    // So keep looking, and follow the CTA to its new node.
    const mo = new MutationObserver(() => attach(document.querySelector(CTA_SELECTOR)));
    mo.observe(document.body, { childList: true, subtree: true });

    const initial = document.querySelector(CTA_SELECTOR);
    if (initial) attach(initial);
    // Nothing yet: it may be a route with no CTA, or one that has not
    // mounted. The observer above catches the second case; if nothing has
    // turned up by the next frame, take it as the first and show.
    // (Not a bare setHidden() here -- a synchronous setState in an effect
    // body cascades a render.)
    const raf = initial ? null : requestAnimationFrame(() => setHidden(false));

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      io?.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  // Nothing to launch when you are already there. After the hooks, never
  // before -- an early return above them would change the hook order.
  if (pathname === CHATROOM_PATH) return null;

  return (
    <Link
      to={CHATROOM_PATH}
      className={`chat-launcher${hidden ? ' is-hidden' : ''}`}
      aria-label="Chat with my virtual persona"
      // Kept out of the tab order and off the a11y tree while it is the
      // CTA's turn, so keyboard users don't land on an invisible control.
      tabIndex={hidden ? -1 : undefined}
      aria-hidden={hidden || undefined}
    >
      {/* The name is on the link via aria-label, so the image itself is
          decorative -- described twice otherwise. */}
      <img src={robotIcon} alt="" aria-hidden="true" />
    </Link>
  );
}
