// Base URL for images/files served from object storage (S3 via CloudFront).
// Not a secret -- it ends up in the shipped JS and in <img src> anyway --
// so it's hardcoded here. An optional VITE_CDN_BASE env var still overrides
// it (e.g. to point at a staging bucket) but nothing needs to set one.
const CDN_BASE = (import.meta.env.VITE_CDN_BASE ?? 'https://d5ydhntfck9s8.cloudfront.net').replace(/\/$/, '');

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
