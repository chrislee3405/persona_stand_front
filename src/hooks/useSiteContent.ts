import { createContext, useContext } from 'react';

/** One image slot for a section: a label plus the S3 object key.
 *  Internal to this module -- consumers use pickImage() / the `images` map. */
export interface SiteImage {
  description: string;
  path: string;
}

/** Everything GET /api/site-content returns, plus the in-flight flag. */
export interface SiteContentValue {
  content: Record<string, unknown>;
  images: Record<string, SiteImage[]>;
  journeyDetails: Record<string, unknown>;
  projectDetails: Record<string, unknown>;
  loading: boolean;
}

/**
 * Shared state for the site copy. The single fetch that fills it lives in
 * <SiteContentProvider> (context/SiteContentProvider.tsx), mounted once at
 * the app root -- so it survives route changes and every page reads the
 * same already-loaded payload.
 *
 * The default below is what a consumer rendered OUTSIDE the provider sees:
 * empty content and loading already finished, so it renders its normal
 * "nothing here" state rather than hanging on a spinner that will never
 * resolve.
 */
export const SiteContentContext = createContext<SiteContentValue>({
  content: {},
  images: {},
  journeyDetails: {},
  projectDetails: {},
  loading: false,
});

/**
 * Reads the static website copy that used to be hardcoded in the pages
 * (personal statement, qualifications, certifications, journey, contact,
 * chatroom) -- served from the backend so it can change without a frontend
 * redeploy.
 *
 * One fetch, made once for the whole app, returns every section at once:
 *   {
 *     content: { "<section>": <json for that section>, ... },
 *     images:  { "<section>": [ { description, path }, ... ], ... },
 *     journeyDetails: { "<journey block id>": <detail json>, ... },
 *     projectDetails: { "<project id>": <detail json>, ... }
 *   }
 * Text lives in the `site_content` table (shape differs per section -- an
 * object for prose sections, an array for the journey timeline); images
 * live in the separate `site_image` table, keyed by section and a slot
 * `description` (e.g. "hero"); the expanded copy for the Journey and
 * Projects click-through pop-ups lives in `site_journey` / `site_project`,
 * keyed by a journey block's / project's `id`. All are {} until the fetch
 * resolves (and stay {} if it fails), so pages must render a sensible
 * empty/loading state. Resolve an image `path` to a URL with assetUrl().
 *
 * This is a context read, not a fetch: calling it from another page costs
 * nothing and returns whatever has already loaded.
 */
export function useSiteContent(): SiteContentValue {
  return useContext(SiteContentContext);
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
