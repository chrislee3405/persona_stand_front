import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SiteContentContext, type SiteImage } from '../hooks/useSiteContent';

/** How long to wait for /api/site-content before giving up and showing the
 *  failure state. A hung request is not the same as a slow one: without a
 *  deadline `loading` stayed true forever, and because <SectionState>
 *  renders NOTHING while loading, the page sat showing section headings and
 *  no content, permanently, with no spinner and no error -- a worse outcome
 *  than the request failing outright. */
const FETCH_TIMEOUT_MS = 10_000;

/** One retry, because the common failure here is a cold backend or a
 *  dropped connection on a phone, both of which a second attempt fixes. */
const RETRY_DELAY_MS = 1_200;

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
 *
 * FAILURE IS REPORTED, NOT SWALLOWED. Every error path used to collapse to
 * the same empty `{}` this provider uses for "nothing configured yet", so
 * a backend outage and an empty database rendered a character-for-character
 * identical page: "No projects content yet. / No contact content yet."
 * A visitor arriving mid-outage saw a portfolio that appeared to have no
 * projects and no contact details, and the owner had no signal at all. The
 * `error` flag below is what lets <SectionState> tell those two apart.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [images, setImages] = useState<Record<string, SiteImage[]>>({});
  const [journeyDetails, setJourneyDetails] = useState<Record<string, unknown>>({});
  const [projectDetails, setProjectDetails] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Bumped by retry() to re-run the effect.
  const [attempt, setAttempt] = useState(0);

  // The state reset lives here, not at the top of the effect. Both values
  // already start in the right state on mount, so only a retry needs to put
  // them back -- and a synchronous setState in an effect body cascades a
  // render (react-hooks/set-state-in-effect).
  const retry = useCallback(() => {
    setLoading(true);
    setError(false);
    setAttempt(n => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // `once` guards the retry: a failure schedules exactly one more attempt,
    // and only from the first.
    const load = async (isRetry: boolean): Promise<void> => {
      try {
        const res = await fetch('/api/site-content', {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        // Checked explicitly. Without this a 500 whose body happens to be
        // valid JSON was treated as a successful empty payload, and a 500
        // returning the SPA's index.html (which is what the proxy serves
        // when the backend is down) only failed later, at res.json(), where
        // it was indistinguishable from a parse error.
        if (!res.ok) throw new Error(`site-content responded ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setContent(data?.content && typeof data.content === 'object' ? data.content : {});
        setImages(data?.images && typeof data.images === 'object' ? data.images : {});
        setJourneyDetails(
          data?.journeyDetails && typeof data.journeyDetails === 'object' ? data.journeyDetails : {},
        );
        setProjectDetails(
          data?.projectDetails && typeof data.projectDetails === 'object' ? data.projectDetails : {},
        );
        setError(false);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (!isRetry) {
          console.warn('Site content fetch failed, retrying once:', err);
          window.setTimeout(() => {
            if (!cancelled) void load(true);
          }, RETRY_DELAY_MS);
          return;
        }
        console.error('Failed to load site content:', err);
        setContent({}); setImages({}); setJourneyDetails({}); setProjectDetails({});
        setError(true);
        setLoading(false);
      }
    };

    void load(false);
    return () => { cancelled = true; };
  }, [attempt]);

  // Memoised: without it every provider render hands consumers a brand new
  // object, and Home derives memoised work (journeyIds, projectItems) from
  // these -- a fresh identity each render would rebuild that work and the
  // observers keyed to it.
  const value = useMemo(
    () => ({ content, images, journeyDetails, projectDetails, loading, error, retry }),
    [content, images, journeyDetails, projectDetails, loading, error, retry],
  );

  return (
    <SiteContentContext.Provider value={value}>
      {children}
    </SiteContentContext.Provider>
  );
}
