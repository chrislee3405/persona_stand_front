import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The technology chips shown under a project thumbnail.
 *
 * Shows EVERY chip while the list fits within two rows. Only once it would
 * wrap onto a third row does the overflow collapse into a single "+N"
 * chip. That is a layout fact, not a fixed count, so it is measured: the
 * chips render in full first, then a layout effect counts the rows and
 * trims before paint (useLayoutEffect -> no visible flash of the full
 * list). A ResizeObserver re-runs it when the card's width changes.
 *
 * With no JS (or before the effect runs) every chip shows -- the safe
 * degradation for a thumbnail caption.
 */
export default function TechChips({ items }: { items: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Stable across renders while the chip set is unchanged (the `items`
  // array identity is not -- it is rebuilt each render in Home).
  const key = items.join(' ');

  // null   -> render every chip; the effect below then measures it
  // number -> render this many chips followed by a "+N" overflow chip
  const [limit, setLimit] = useState<number | null>(null);

  // A new chip set means "measure from scratch". Done DURING RENDER (the
  // React pattern for state that follows a prop -- see ProjectSheet), so
  // it costs no extra paint and no setState runs from inside an effect.
  const [measuredKey, setMeasuredKey] = useState(key);
  if (key !== measuredKey) {
    setMeasuredKey(key);
    setLimit(null);
  }

  // Re-measure when the card's width changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLimit(null));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Trim to two rows. The row count can only be read from the laid-out
  // DOM, not derived during render, and the correction must land before
  // paint -- which is exactly what useLayoutEffect + setState is for. It
  // only ever shrinks and stops as soon as two rows fit (each setLimit is
  // guarded), so the cascade is bounded.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chips = Array.from(el.children) as HTMLElement[];
    if (chips.length <= 2) return;

    // Distinct row offsets, top to bottom.
    const rowTops: number[] = [];
    for (const chip of chips) {
      const top = chip.offsetTop;
      if (!rowTops.length || top - rowTops[rowTops.length - 1] > 1) rowTops.push(top);
    }
    if (rowTops.length <= 2) return; // fits in two rows -> show all

    if (limit === null) {
      // First trim: drop everything from the third row on, then one more
      // slot for the "+N" chip itself.
      let spill = chips.findIndex(c => c.offsetTop >= rowTops[2]);
      if (spill === -1) spill = chips.length;
      setLimit(Math.max(1, spill - 1));
    } else if (limit > 1) {
      // Still three rows (a wide "+N" pushed a chip down): shrink one more
      // and re-measure next pass. Only shrinks, so it settles.
      setLimit(limit - 1);
    }
  }, [limit, key]);

  const showAll = limit === null || limit >= items.length;
  const visible = showAll ? items : items.slice(0, limit as number);
  const hidden = showAll ? 0 : items.length - visible.length;

  return (
    <span className="proj-card__tech" ref={ref}>
      {visible.map(t => (
        <span className="proj-card__chip" key={t}>{t}</span>
      ))}
      {hidden > 0 && (
        <span className="proj-card__chip proj-card__chip--more">+{hidden}</span>
      )}
    </span>
  );
}
