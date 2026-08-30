import { useState, useEffect } from 'react';

/**
 * Loads the static website copy that used to be hardcoded in the pages
 * (personal statement, qualifications, journey, contact) from the backend
 * `site_content` table via GET /api/site-content, so it can change without
 * a frontend redeploy.
 *
 * One fetch on mount returns every section at once:
 *   { content: { "<section>": <json for that section>, ... } }
 * The JSON shape differs per section (an object for prose sections, an
 * array for the journey timeline) -- each page reads its own key and knows
 * its shape. `content` is {} until the fetch resolves (and stays {} if it
 * fails), so pages must render a sensible empty/loading state.
 */
export function useSiteContent() {
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/site-content')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setContent(data?.content && typeof data.content === 'object' ? data.content : {});
      })
      .catch(error => {
        console.error('Failed to load site content:', error);
        if (!cancelled) setContent({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { content, loading };
}
