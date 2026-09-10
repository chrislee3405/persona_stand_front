import { useSiteContent } from '../hooks/useSiteContent';

/**
 * The loading / failed / nothing-here line every Home section shows before
 * its content arrives. Five sections repeated this pair of conditionals
 * verbatim, so a copy change meant five edits.
 *
 * Renders nothing once content has loaded, so it can sit above the real
 * markup without a wrapper.
 *
 * THREE states, not two. "The database has no projects yet" and "the
 * server did not answer" used to render the same sentence -- so a visitor
 * arriving during a backend outage was told, in the site's own voice, that
 * it had no projects and no contact details, and nothing anywhere
 * indicated a fault. `error` comes from <SiteContentProvider>, which now
 * distinguishes a failed fetch from an empty payload.
 */
export default function SectionState({
  loading,
  empty,
  noun,
}: {
  loading: boolean;
  /** True when the fetch finished but this section has no content. */
  empty: boolean;
  /** What's missing, as it reads mid-sentence: "No projects content yet." */
  noun: string;
}) {
  const { error, retry } = useSiteContent();

  // While the fetch is in flight, render NOTHING rather than either a
  // spinner line or the empty-state copy. "No projects content yet." was
  // being shown during loading, so a slow connection's first impression
  // was a site that appeared to have no content. An empty region for a
  // moment reads as loading; a sentence saying there is nothing does not.
  if (loading) return null;

  // Checked before `empty`, because a failed fetch leaves every section
  // empty and the emptiness is a symptom, not the fact worth reporting.
  if (error) {
    return (
      <p className="text-muted" role="status">
        Couldn't load this section.{' '}
        <button type="button" className="btn btn-link p-0 align-baseline" onClick={retry}>
          Try again
        </button>
      </p>
    );
  }

  if (empty) return <p className="text-muted">No {noun} content yet.</p>;
  return null;
}
