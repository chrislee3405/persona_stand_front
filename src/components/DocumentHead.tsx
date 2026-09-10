import { useEffect } from 'react';
import { useSiteContent } from '../hooks/useSiteContent';

/**
 * Keeps the document <head> in step with the database, so NO personal
 * content has to live in index.html.
 *
 * index.html ships generic, person-free fallbacks for <title>, the meta
 * description and the og:* tags. Once the `personal_statement` row lands,
 * this component rewrites them from it -- the same fields the About <h1>,
 * the role line and the bio are built from (see Home.tsx).
 *
 * Renders nothing; mounted once under <SiteContentProvider> in App.tsx.
 * It only writes when there is real data, so a failed fetch or an
 * unconfigured row leaves the generic index.html fallbacks standing
 * rather than blanking anything.
 *
 * LIMIT: the og: and description updates here reach a normal browser but
 * NOT a link-preview crawler, which never runs this code. Until the site has a
 * real domain worth sharing, the generic fallbacks are what a crawler
 * gets; the real fix is a backend-rendered shell.
 */
const DESCRIPTION_MAX = 160;

/**
 * Turn the bio `body` into a meta-description string: take the opening
 * paragraph (up to the first blank line -- a description is the lede, not
 * the whole bio), drop "- " / "* " bullet markers (the body may be point
 * form after the <Prose> change), collapse whitespace, and trim to a word
 * boundary under DESCRIPTION_MAX with an ellipsis.
 */
function bodyToDescription(body: string): string {
  const firstPara = body.split(/\n{2,}/)[0] ?? '';
  const flat = firstPara
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= DESCRIPTION_MAX) return flat;
  const cut = flat.slice(0, DESCRIPTION_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : DESCRIPTION_MAX).trimEnd()}…`;
}

function setMeta(selector: string, value: string): void {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.content = value;
}

export default function DocumentHead() {
  const { content } = useSiteContent();
  const statement = (content.personal_statement ?? {}) as {
    owner?: string;
    title?: string;
    heading?: string;
    body?: string;
  };

  const owner = statement.owner?.trim();
  // Same precedence as the About section: `title` superseded `heading`,
  // still read as a fallback for a row written before the rename.
  const role = (statement.title ?? statement.heading)?.trim();
  const title = owner ? (role ? `${owner} — ${role}` : owner) : null;
  const description =
    typeof statement.body === 'string' && statement.body.trim()
      ? bodyToDescription(statement.body)
      : title;

  useEffect(() => {
    if (title) {
      document.title = title;
      setMeta('meta[property="og:title"]', title);
    }
    if (owner) {
      setMeta('meta[property="og:site_name"]', owner);
      setMeta('meta[property="og:image:alt"]', `${owner} — portfolio preview`);
    }
    if (description) {
      setMeta('meta[name="description"]', description);
      setMeta('meta[property="og:description"]', description);
    }
  }, [title, owner, description]);

  return null;
}
