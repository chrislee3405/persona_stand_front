/**
 * The technology chips shown under a project thumbnail.
 *
 * Shows at most MAX_VISIBLE_CHIPS named chips; anything beyond that is
 * summarised as a single "+N" chip.
 *
 * DELIBERATELY NOT MEASURED. This used to render every chip, count the
 * resulting rows in a layout effect, trim to two rows, and re-measure through
 * a ResizeObserver. The three parts fought each other: the observer's callback
 * reset the trim to "show everything", showing everything made the element
 * taller, and the taller element re-fired the observer -- so any project with
 * enough chips to overflow two rows re-rendered forever, flickering between
 * the full and trimmed lists and holding the CPU busy on the page every
 * visitor lands on.
 *
 * A fixed count cannot do that. It also cannot be wrong in a way the visitor
 * notices: the chips are a caption, not data, and "+4" says the same thing a
 * measured trim would. If the cap ever needs to change it is one number here,
 * not a measurement cycle.
 */

/**
 * How many chips show with their full name before the rest are rolled into
 * "+N". Eight fits two rows at every card width the scroller uses.
 */
const MAX_VISIBLE_CHIPS = 8;

export default function TechChips({ items }: { items: string[] }) {
  const visible = items.slice(0, MAX_VISIBLE_CHIPS);
  const hidden = items.length - visible.length;

  return (
    <span className="proj-card__tech">
      {visible.map(t => (
        <span className="proj-card__chip" key={t}>{t}</span>
      ))}
      {hidden > 0 && (
        <span className="proj-card__chip proj-card__chip--more">+{hidden}</span>
      )}
    </span>
  );
}
