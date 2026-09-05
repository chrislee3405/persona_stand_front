/**
 * The loading / nothing-here line every Home section shows before its
 * content arrives. Five sections repeated this pair of conditionals
 * verbatim, so a copy change meant five edits.
 *
 * Renders nothing once content has loaded, so it can sit above the real
 * markup without a wrapper.
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
  if (loading) return <p className="text-muted">Loading…</p>;
  if (empty) return <p className="text-muted">No {noun} content yet.</p>;
  return null;
}
