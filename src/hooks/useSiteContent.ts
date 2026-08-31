import { useState, useEffect } from 'react';

/** One image slot for a section: a label plus the S3 object key. */
export interface SiteImage {
  description: string;
  path: string;
}

/**
 * Loads the static website copy that used to be hardcoded in the pages
 * (personal statement, qualifications, certifications, journey, contact)
 * from the backend via GET /api/site-content, so it can change without a
 * frontend redeploy.
 *
 * One fetch on mount returns every section at once:
 *   {
 *     content: { "<section>": <json for that section>, ... },
 *     images:  { "<section>": [ { description, path }, ... ], ... }
 *   }
 * Text lives in the `site_content` table (shape differs per section -- an
 * object for prose sections, an array for the journey timeline); images
 * live in the separate `site_image` table, keyed by section and a slot
 * `description` (e.g. "hero"). Both are {} until the fetch resolves (and
 * stay {} if it fails), so pages must render a sensible empty/loading
 * state. Resolve an image `path` to a URL with assetUrl().
 */
export function useSiteContent() {
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [images, setImages] = useState<Record<string, SiteImage[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/site-content')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setContent(data?.content && typeof data.content === 'object' ? data.content : {});
        setImages(data?.images && typeof data.images === 'object' ? data.images : {});
      })
      .catch(error => {
        console.error('Failed to load site content:', error);
        if (!cancelled) { setContent({}); setImages({}); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { content, images, loading };
}

/**
 * Picks one image slot's S3 key out of the map returned by useSiteContent.
 * Returns the first slot matching `description` for the section, or the
 * section's first image if `description` is omitted, or undefined.
 */
export function pickImage(
  images: Record<string, SiteImage[]>,
  section: string,
  description?: string,
): string | undefined {
  const list = images[section];
  if (!list || list.length === 0) return undefined;
  if (!description) return list[0].path;
  return list.find(img => img.description === description)?.path;
}
