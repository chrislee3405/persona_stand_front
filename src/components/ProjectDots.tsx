import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A minimap for the horizontal projects scroller: one dot per project, with
 * a rounded "window" outline that slides/resizes over the dots to show
 * which projects are currently in view. Recomputed on scroll and resize.
 *
 * `scrollerRef` points at the flex scroll container (`.proj-scroller`);
 * its direct children are the project items, in order. The window's
 * left/width are set imperatively in px from the real dot positions.
 */
export default function ProjectDots({
  count,
  scrollerRef,
}: {
  count: number;
  scrollerRef: React.RefObject<HTMLElement | null>;
}) {
  const dotsRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLSpanElement>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Index range of the projects at least mostly on screen right now (drives
  // the active-dot styling; the window outline is positioned imperatively).
  const [range, setRange] = useState({ first: 0, last: Math.max(0, count - 1) });

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const positionWindow = (first: number, last: number) => {
      const cont = dotsRef.current;
      const win = windowRef.current;
      const fd = dotRefs.current[first];
      const ld = dotRefs.current[last];
      if (!cont || !win || !fd || !ld) return;
      const cr = cont.getBoundingClientRect();
      const fr = fd.getBoundingClientRect();
      const lr = ld.getBoundingClientRect();
      const inset = 4; // how far the outline sits outside the dots
      win.style.left = `${fr.left - cr.left + cont.scrollLeft - inset}px`;
      win.style.width = `${lr.right - fr.left + inset * 2}px`;
    };

    const recompute = () => {
      const kids = Array.from(scroller.children) as HTMLElement[];
      if (kids.length === 0) return;
      const view = scroller.getBoundingClientRect();
      let first = -1;
      let last = -1;
      kids.forEach((kid, i) => {
        const r = kid.getBoundingClientRect();
        const shown = Math.min(r.right, view.right) - Math.max(r.left, view.left);
        if (shown > r.width * 0.4) {
          if (first === -1) first = i;
          last = i;
        }
      });
      if (first === -1) {
        // Nothing cleared the 40% bar (very narrow viewport) -- fall back to
        // whichever item is nearest the left edge.
        first = last = kids.reduce(
          (best, kid, i) =>
            Math.abs(kid.getBoundingClientRect().left - view.left) <
            Math.abs(kids[best].getBoundingClientRect().left - view.left)
              ? i
              : best,
          0,
        );
      }
      first = Math.min(first, count - 1);
      last = Math.min(last, count - 1);
      setRange(prev => (prev.first === first && prev.last === last ? prev : { first, last }));
      positionWindow(first, last);
    };

    recompute();
    scroller.addEventListener('scroll', recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(scroller);
    if (dotsRef.current) ro.observe(dotsRef.current);
    window.addEventListener('resize', recompute);
    return () => {
      scroller.removeEventListener('scroll', recompute);
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [scrollerRef, count]);

  const goTo = (i: number) => {
    const kid = scrollerRef.current?.children[i] as HTMLElement | undefined;
    kid?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className="proj-dots-bar">
      {/* .proj-dots is a plain positioned box; the flex row is an inner
          wrapper so the absolutely-positioned window isn't a flex item
          (justify-content on a flex parent breaks abs positioning of its
          children in Chromium). */}
      <div className="proj-dots" ref={dotsRef} aria-label="Projects">
        <span className="proj-dots__window" ref={windowRef} aria-hidden="true" />
        <div className="proj-dots__track">
          {Array.from({ length: count }, (_, i) => {
            const inView = i >= range.first && i <= range.last;
            return (
              <button
                key={i}
                type="button"
                ref={node => {
                  dotRefs.current[i] = node;
                }}
                className={`proj-dots__dot${inView ? ' is-active' : ''}`}
                aria-label={`Scroll to project ${i + 1} of ${count}`}
                aria-current={inView ? 'true' : undefined}
                onClick={() => goTo(i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
