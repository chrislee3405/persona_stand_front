/**
 * Runs `fn` at most once per animation frame, no matter how often the
 * returned function is called.
 *
 * Scroll events fire far faster than the screen repaints, and the three
 * handlers using this all do forced layout -- `getBoundingClientRect()` on
 * every section or every project card, `scrollHeight` on the document --
 * with one of them writing styles back in the same pass, which is a
 * read-write-read cycle the browser cannot batch. Doing that work more
 * than once between paints is, by definition, work whose result is never
 * seen.
 *
 * A latch rather than a timer: `requestAnimationFrame` lines the work up
 * with the paint that will actually show it, so nothing is throttled below
 * the rate the display can present, and nothing runs above it.
 *
 * `.cancel()` is on the returned function so effect cleanup can drop a
 * frame that is still queued -- otherwise a handler can fire once after
 * its listeners have been removed and its component unmounted.
 */
export function rafThrottle<A extends unknown[]>(
  fn: (...args: A) => void,
): ((...args: A) => void) & { cancel: () => void } {
  let frame: number | null = null;
  let lastArgs: A | null = null;

  const wrapped = (...args: A) => {
    lastArgs = args;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (lastArgs) fn(...lastArgs);
    });
  };

  wrapped.cancel = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };

  return wrapped;
}
