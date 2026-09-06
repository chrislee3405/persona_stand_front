/**
 * The Qualifications & Awards and Certifications lists. Both sections hold
 * the same shape -- a title, the body that granted it, a year and an
 * optional extra line -- and both previously rendered it as near-identical
 * bullet markup, so a change to one silently skipped the other.
 *
 * Rendered as a stack of bordered rows rather than bullets: a credential
 * is a record, and a record wants a card. The year is pulled out to the
 * right of the title so a reader scanning dates never has to read the
 * sentence, which is what bullets forced.
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

export default function CredentialList({ items }: { items: Credential[] }) {
  if (items.length === 0) return null;
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
