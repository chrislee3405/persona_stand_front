/**
 * The credential cards shared by Education (inside About) and
 * "Certification & Award". Both hold the same shape -- a title, the body
 * that granted it, a year and an optional extra line -- and render it the
 * same way, so a change to one cannot silently skip the other.
 *
 * A stack of bordered rows with the year pulled out to the right, so a
 * reader scanning dates never has to read the sentence.
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
  label,
}: {
  items: Credential[];
  /** Accessible name for the list, for a caller with no visible heading
   *  above it (Education in About). Not drawn. */
  label?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="cred" aria-label={label}>
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
