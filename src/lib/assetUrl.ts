// Base URL for images/files served from object storage (S3 via CloudFront).
//
// ONE SOURCE, no fallback. This used to default to a hardcoded CloudFront
// domain when VITE_CDN_BASE was unset, and that default was actively harmful
// rather than helpful: it hid a broken build. index.html substitutes
// %VITE_CDN_BASE% with NO fallback, so an unset variable shipped an HTML file
// containing the literal string `%VITE_CDN_BASE%` in the favicon, the
// apple-touch-icon, the og:image and both hero preloads -- while this module's
// default kept every actual page image working, so nothing looked wrong.
//
// The value now reaches three places from one variable: this module (the JS
// bundle), index.html (Vite's HTML substitution), and nginx's CSP img-src /
// media-src (templated into the config at image build time -- see the
// frontend Dockerfile). Vite inlines it at BUILD time, so it is baked into the
// image and cannot be changed at container start.
//
// Not a secret: it ends up in the shipped JS and in every <img src> anyway.
// It is simply required, and vite.config.ts fails the build when it is absent
// rather than letting a half-configured bundle ship.
const CDN_BASE = import.meta.env.VITE_CDN_BASE.replace(/\/$/, '');

/**
 * Turns a stored object key (e.g. "about/hero.jpg") into a full URL.
 * The database stores only the key; the CDN host lives here so it can
 * change without touching the data. Returns undefined for an empty key so
 * callers can fall back to a placeholder.
 */
export function assetUrl(key?: string | null): string | undefined {
  if (!key) return undefined;
  // Keys come from the database, and the URL built here is interpolated into
  // CSS as well as into <img src>: Home.tsx sets `--hero-img: url("<this>")`
  // through a custom property, which React does NOT escape. A key containing
  // a quote or a parenthesis could therefore close that url() and append
  // declarations of its own -- `a.jpg") , url("https://elsewhere/x` injects a
  // second image request. The CSP's img-src stops that request leaving, but it
  // should never be built in the first place.
  //
  // So a key carrying any character that can break out of url("...") -- a
  // quote, a parenthesis, a backslash, whitespace, or a control character --
  // is refused, and the caller falls back to its placeholder exactly as it
  // does for a missing key. The same characters are rejected at write time by
  // the backend's content validator (validate_media); this is the read-side
  // half, for rows written before that existed or round it.
  if (typeof key !== 'string' || isUnsafeKey(key)) return undefined;
  return `${CDN_BASE}/${key.replace(/^\//, '')}`;
}

/**
 * True for a key containing anything that can end or escape a CSS
 * `url("...")` token -- a quote, a parenthesis, a backslash -- or any
 * whitespace or control character, none of which belong in an S3 object key
 * this site uses. Control characters are found by char code rather than by a
 * regex character class, which the no-control-regex lint rule forbids.
 */
function isUnsafeKey(key: string): boolean {
  // The class is: double quote, single quote, both parentheses, a backslash
  // (written `\\`), and any whitespace (`\s`).
  if (/["'()\\\s]/.test(key)) return true;
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
