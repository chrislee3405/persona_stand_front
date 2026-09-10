/**
 * Splits a body string (straight out of a JSONB column) into render
 * blocks for <Prose>:
 *
 *  - blank lines separate paragraphs, so "\n\n" becomes real paragraphs
 *    rather than collapsed whitespace;
 *  - a run of lines that each start with "- " or "* " becomes one bullet
 *    list ("point form"), no blank line required to start it;
 *  - paragraphs and lists mix freely in one string.
 *
 * Pure and side-effect free -- kept out of the component file so it can be
 * exercised on its own, and so the component file keeps exporting only a
 * component (react-refresh).
 *
 * The caller passes an already-narrowed string; a non-string upstream is
 * rendered as nothing by <Prose>, the same as an absent field.
 */
export type ProseBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] };

// "- item" or "* item", with optional leading indent. Group 1 is the item
// text without the marker. Deliberately strict -- the marker must be
// followed by whitespace AND some content -- so "-5°C" or a lone "-" is
// prose, and a sentence that merely opens with "- " is the only false
// positive (the author's call to make).
const BULLET = /^\s*[-*]\s+(.+)$/;

export function parseProse(src: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let para: string[] = [];
  let items: string[] = [];

  const flushPara = () => {
    const text = para.join(' ').trim();
    if (text) blocks.push({ kind: 'p', text });
    para = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ kind: 'ul', items });
    items = [];
  };

  for (const raw of src.split('\n')) {
    const line = raw.trim();
    const bullet = BULLET.exec(line);
    if (bullet) {
      // A list interrupts a paragraph without needing a blank line first.
      flushPara();
      items.push(bullet[1].trim());
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
