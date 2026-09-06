import { useLayoutEffect, useRef } from 'react';

/** How far a section's top edge must travel into the viewport before it
 *  starts fading in, as a share of viewport height. Bigger = the fade
 *  starts later (the section is further up the screen). */
const REVEAL_TRIGGER_INSET = '12%';

/**
 * Fades each Home section in from transparent the first time it is
 * scrolled to. Give it the section ids (SECTION_IDS) -- it looks them up
 * by `document.getElementById`, so it doesn't care whether a section is a
 * plain <section> or a <HeroBand>.
 *
 * The hidden state is applied FROM HERE, not from the stylesheet: the hook
 * adds `reveal` (opacity: 0) to each section as it starts observing, and
 * swaps in `reveal--in` (opacity: 1) once the section reaches the trigger
 * line. So if this never runs -- no IntersectionObserver, JS disabled, an
 * id that doesn't exist -- the sections simply stay visible rather than
 * being stranded at opacity 0. It's a `useLayoutEffect` for the same
 * reason: the class has to land before the browser paints, or the first
 * frame shows the sections at full opacity and they blink out.
 *
 * Deliberately opacity-only, no transform. Home measures section geometry
 * in two places -- the scroll-spy compares each section's
 * getBoundingClientRect().top against a fixed line, and the trailing
 * spacer sizes itself from Contact's document offset -- and a section
 * sliding under its own reveal would feed both of them positions that are
 * off by the travel distance. Opacity moves nothing, so both stay exact.
 *
 * Revealing is one-way: a section that has faded in is unobserved and
 * never re-hidden, so scrolling back up doesn't replay it.
 */
export function useRevealOnScroll(
  ids: readonly string[],
  /**
   * Any value that changes when the sections' DOM nodes might have been
   * swapped -- Home passes `loading`, which flips as content arrives and
   * turns plain <section>s into <HeroBand>s. The observer is rebuilt
   * against the new nodes; sections already revealed stay revealed (see
   * `done`) instead of fading in a second time.
   */
  refresh?: unknown,
) {
  // Ids already faded in, kept across re-runs so a node swap doesn't
  // replay the animation on a section the user has already seen.
  const done = useRef(new Set<string>());

  useLayoutEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const els = ids
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    // Under reduced motion there's nothing to stagger in -- leave every
    // section at its natural opacity and skip the observer entirely.
    if (reduced) {
      els.forEach(el => el.classList.remove('reveal', 'reveal--in'));
      return;
    }

    const show = (el: HTMLElement) => {
      done.current.add(el.id);
      el.classList.add('reveal', 'reveal--in');
    };

    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          show(e.target as HTMLElement);
          io.unobserve(e.target); // one-way: never fade back out
        }
      },
      {
        // Trigger once the section's leading edge has come a short way up
        // into the viewport, rather than the instant its first pixel
        // appears. threshold 0 (not a ratio) so sections taller than the
        // viewport still fire -- they can never be 15% visible at once.
        rootMargin: `0px 0px -${REVEAL_TRIGGER_INSET} 0px`,
        threshold: 0,
      },
    );

    for (const el of els) {
      if (done.current.has(el.id)) {
        show(el); // already seen -- straight to visible, no animation
        continue;
      }
      el.classList.add('reveal');
      io.observe(el);
    }

    return () => io.disconnect();
  }, [ids, refresh]);
}
