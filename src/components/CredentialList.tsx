/**
 * The Qualifications & Awards and Certifications lists. Both sections hold
 * the same shape -- a title, the body that granted it, a year and an
 * optional extra line -- and both previously rendered it as near-identical
 * bullet markup, so a change to one silently skipped the other.
 *
 * Two presentations, because the two callers are not doing the same job.
 *
 * `cards` (default) is a stack of bordered rows with the year pulled out
 * to the right, so a reader scanning dates never has to read the
 * sentence. That is right for "Certification & Award", which IS the
 * section -- the records are what the reader came for.
 *
 * `list` is plain bullets. Education is a sub-part of About, sitting
 * under a bio, a role line, skill pills and a chat button; giving four
 * degrees the same bordered-card weight as the section that is entirely
 * about credentials made the page read as a wall of boxes. A bullet says
 * "supporting detail" and gets out of the way.
 *
 * The two sections differ only in what the second line is called --
 * `institution` for a degree, `issuer` for a certificate -- so callers
 * pass whichever they hold as `org`.
 */
export interface Credential {
  id: string;
  title: string;
  /** Awarding body: a school for a qualification, an issuer for a cert. */
  org?: string;
  year?: string;
  detail?: string | null;
}

export default function CredentialList({
  items,
  variant = 'cards',
}: {
  items: Credential[];
  /** `cards` for a section of records, `list` for supporting detail. */
  variant?: 'cards' | 'list';
}) {
  if (items.length === 0) return null;

  if (variant === 'list') {
    return (
      <ul className="cred cred--list">
        {items.map(item => (
          // Same two-part shape as the cards: the qualification on its
          // own line, then who granted it beneath. The class names are
          // shared with the card variant -- the same fields mean the same
          // things -- and .cred--list re-lays them out.
          //
          // `cred__sub` exists only to hold the org and the year on ONE
          // line together. Without it the org would have to be a block to
          // break the line, and a block sibling forces the year that
          // follows it into an anonymous block of its own -- landing it
          // on a third line instead of after the institution.
          <li key={item.id}>
            <span className="cred__title">{item.title}</span>
            {(item.org || item.year) && (
              <span className="cred__sub">
                {item.org && <span className="cred__org">{item.org}</span>}
                {item.year && <span className="cred__year">{item.year}</span>}
              </span>
            )}
            {item.detail && <span className="cred__detail">{item.detail}</span>}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="cred">
      {items.map(item => (
        <li key={item.id} className="cred__item">
          <div className="cred__head">
            <span className="cred__title">{item.title}</span>
            {item.year && <span className="cred__year">{item.year}</span>}
          </div>
          {item.org && <div className="cred__org">{item.org}</div>}
          {item.detail && <div className="cred__detail">{item.detail}</div>}
        </li>
      ))}
    </ul>
  );
}
