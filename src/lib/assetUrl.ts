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
  return `${CDN_BASE}/${key.replace(/^\//, '')}`;
}
