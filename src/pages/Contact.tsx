import { useSiteContent } from '../hooks/useSiteContent';

interface ContactInfo {
  intro?: string | null;
  email?: string;
  location?: string;
  links?: { label: string; href: string }[];
}

export default function Contact() {
  const { content, loading } = useSiteContent();
  const info = (content.contact ?? {}) as ContactInfo;
  const links = Array.isArray(info.links) ? info.links : [];

  return (
    <div className="container py-4">
      <h2>My Contact</h2>

      {loading && <p className="text-muted">Loading…</p>}

      {info.intro && <p className="lead text-secondary lh-base">{info.intro}</p>}

      <dl className="row">
        {info.email && (
          <>
            <dt className="col-sm-3">Email</dt>
            <dd className="col-sm-9"><a href={`mailto:${info.email}`}>{info.email}</a></dd>
          </>
        )}
        {info.location && (
          <>
            <dt className="col-sm-3">Location</dt>
            <dd className="col-sm-9">{info.location}</dd>
          </>
        )}
      </dl>

      {links.length > 0 && (
        <ul className="list-unstyled">
          {links.map(link => (
            <li key={link.href} className="mb-2">
              <a href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
