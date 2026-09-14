/**
 * Filters a database-supplied `href` down to the schemes this site actually
 * links with.
 *
 * Every link target on the page -- contact links, footer links, journey
 * sheet links, a project's GitHub and demo URLs -- comes out of a JSONB
 * column that nothing validates. The only thing standing between that
 * column and the DOM was a React internal: React 19 rewrites a
 * `javascript:` href to a blocked throw, which is why no XSS was possible.
 * But that is React's guarantee, not this app's, it covers exactly one
 * scheme, and `data:text/html,...` went through untouched. (Not
 * exploitable -- browsers have blocked top-level `data:` navigation since
 * 2018 -- but "an unrelated library happens to catch the one case we
 * thought of" is not a validation layer.)
 *
 * Allowed: http, https, mailto, tel, and site-relative paths (`/chatroom`,
 * `#projects`). Everything else returns undefined, and callers render the
 * label as plain text instead of a link -- a dead link is a content bug to
 * fix, not something to hand to the browser and hope.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function safeHref(href?: string | null): string | undefined {
  if (typeof href !== 'string') return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;

  // Site-relative. Guard against the forms that LOOK relative and are not:
  //  - `//evil.com`, protocol-relative: same-scheme off-site navigation.
  //  - `/\evil.com`: the WHATWG URL parser treats a backslash as a forward
  //    slash in http(s) URLs, so a browser resolves this to https://evil.com/
  //    exactly as it would `//evil.com`. The previous `//`-only check let it
  //    straight through as a local path.
  //  - any leading backslash, which has no legitimate site-relative meaning.
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
    return undefined;
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('?')) {
    return trimmed;
  }

  try {
    // A base is required so a bare relative path parses; anything carrying
    // its own scheme ignores the base, which is exactly the case being
    // checked.
    const url = new URL(trimmed, window.location.origin);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? trimmed : undefined;
  } catch {
    // Unparseable is not linkable.
    return undefined;
  }
}

/** True when a safe href points off this origin, so the caller knows to add
 *  `target="_blank" rel="noreferrer"`. A relative path never does. */
export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}
