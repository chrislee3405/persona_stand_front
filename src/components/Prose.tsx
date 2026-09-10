import { parseProse } from '../lib/prose';

/**
 * Renders body text stored as a single string.
 *
 *  - Blank lines split the text into paragraphs, so "\n\n" in the content
 *    becomes real paragraphs instead of collapsed whitespace.
 *  - A run of lines that each start with "- " or "* " becomes a bullet
 *    list ("point form"). Paragraphs and lists mix freely in one field:
 *    an intro line, then several "- " lines, renders as an intro
 *    paragraph followed by a list.
 *
 * The parsing is in lib/prose.ts; this file only maps blocks to markup.
 * Shared by the About statement, the Qualifications / Certification
 * blurbs, the Journey card + detail sheet and the Project sheet overview
 * (and the project card's hover blurb), so all of those get the same
 * point-form support from one place.
 *
 * `text` is TYPED as an optional string and CHECKED as an unknown, on
 * purpose. Every caller feeds this straight out of a JSONB column that
 * nothing validates -- not the database (no CHECK constraint), not the API
 * (no response_model), and not the fetch (the payload is asserted, not
 * parsed). This used to be `(text ?? '').split(...)`, where `??` guards
 * null and undefined but not a number: a journey row written `"body": 42`
 * instead of `"body": "42"` threw `r.split is not a function` mid-render
 * and took the WHOLE SITE down to React Router's default error page,
 * stack trace and all. One mistyped value in one row, and the portfolio
 * was gone for every visitor.
 *
 * A non-string still renders as nothing, which is the same outcome as an
 * absent field and the same outcome the section already handles.
 */
export default function Prose({ text }: { text?: string }) {
  const safe = typeof text === 'string' ? text : '';
  const blocks = parseProse(safe);
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block, i) =>
        block.kind === 'ul' ? (
          // The <li>s carry `.lead` like the paragraphs do, so each
          // place's own `.lead` size rule (journey card, sheets) applies
          // to the list too; `.prose__list` only sets the list geometry.
          <ul key={i} className="prose__list">
            {block.items.map((item, j) => (
              <li key={j} className="lead">{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="lead">{block.text}</p>
        ),
      )}
    </>
  );
}
