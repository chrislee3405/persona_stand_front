/**
 * Renders body text stored as a single string, splitting on blank lines so
 * "\n\n" in the content becomes real paragraphs instead of collapsed
 * whitespace. Shared by the About/Qualifications sections, the Journey
 * sheet and the Project sheet.
 */
export default function Prose({ text }: { text?: string }) {
  const paragraphs = (text ?? '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return null;
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i} className="lead text-secondary lh-base">{para}</p>
      ))}
    </>
  );
}
