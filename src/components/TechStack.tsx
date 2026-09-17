import { useEffect, useId, useRef, useState } from 'react';

/** An in-sheet disclosure: stays inside the parent dialog's focus boundary. */
export default function TechStack({ technologies }: { technologies: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    closeButton.current?.focus();
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node &&
          !panel.current?.contains(event.target) &&
          !trigger.current?.contains(event.target)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExpanded(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    // Consume Escape before the surrounding sheet's dismissal handler.
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [expanded]);

  return (
    <>
      <button ref={trigger} type="button" className="psheet__tech-trigger"
        aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? id : undefined}
        onClick={() => setExpanded(value => !value)}>
        <span aria-hidden="true">{'</>'}</span> Tech stack
        <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && (
        <div ref={panel} id={id} role="dialog" aria-labelledby={`${id}-title`}
          className="psheet__tech-popover">
          <div className="psheet__tech-popover-head">
            <strong id={`${id}-title`}>Technologies used</strong>
            <button ref={closeButton} type="button" aria-label="Close tech stack"
              onClick={() => { setExpanded(false); trigger.current?.focus(); }}>×</button>
          </div>
          <ul className="psheet__tech">
            {technologies.map((technology, index) => <li key={index}>{technology}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
