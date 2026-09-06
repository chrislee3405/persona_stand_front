import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SiteContentContext, type SiteImage } from '../hooks/useSiteContent';

/**
 * Fetches GET /api/site-content ONCE for the whole app and hands it to
 * every page through context.
 *
 * It used to be a plain hook that fetched on mount, so each page that
 * wanted any of this paid for its own request: Home refetched every time
 * you came back to it, and the chatroom made a second call just to read
 * the persona's name out of the `chatroom` section. Home -> chatroom ->
 * Home was three requests for one unchanging payload; now it is one.
 *
 * Deliberately in-memory only, not sessionStorage. The whole point of
 * this table is that the copy can change without a redeploy -- a cache
 * that outlived the page load would keep serving the old copy after an
 * edit, and the request it saves is one per visit, not one per
 * navigation.
 *
 * Mounted at the app root (App.tsx) rather than in RootLayout, so nothing
 * about the routing tree can cause it to remount and refetch.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [images, setImages] = useState<Record<string, SiteImage[]>>({});
  const [journeyDetails, setJourneyDetails] = useState<Record<string, unknown>>({});
  const [projectDetails, setProjectDetails] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/site-content')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setContent(data?.content && typeof data.content === 'object' ? data.content : {});
        setImages(data?.images && typeof data.images === 'object' ? data.images : {});
        setJourneyDetails(
          data?.journeyDetails && typeof data.journeyDetails === 'object' ? data.journeyDetails : {},
        );
        setProjectDetails(
          data?.projectDetails && typeof data.projectDetails === 'object' ? data.projectDetails : {},
        );
      })
      .catch(error => {
        console.error('Failed to load site content:', error);
        if (!cancelled) {
          setContent({}); setImages({}); setJourneyDetails({}); setProjectDetails({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Memoised: without it every provider render hands consumers a brand new
  // object, and Home derives memoised work (journeyIds, projectItems) from
  // these -- a fresh identity each render would rebuild that work and the
  // observers keyed to it.
  const value = useMemo(
    () => ({ content, images, journeyDetails, projectDetails, loading }),
    [content, images, journeyDetails, projectDetails, loading],
  );

  return (
    <SiteContentContext.Provider value={value}>
      {children}
    </SiteContentContext.Provider>
  );
}
