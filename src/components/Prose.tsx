/**
 * Renders body text stored as a single string, splitting on blank lines so
 * "\n\n" in the content becomes real paragraphs instead of collapsed
 * whitespace. Shared by the About/Qualifications sections, the Journey
 * sheet and the Project sheet.
 *
 * The paragraphs carry no `text-secondary`: this is the site's primary
 * copy, and that muted grey put it at a bare 4.7:1 on white. `.lead` now
 * carries both the size and a proper reading ink (--ink-body, ~8:1).
 */
export default function Prose({ text }: { text?: string }) {
  const paragraphs = (text ?? '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className="lead">{para}</p>
      ))}
    </>
  );
}
