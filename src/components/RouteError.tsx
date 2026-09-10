import { useRouteError } from 'react-router-dom';

/**
 * What a visitor sees when a route throws.
 *
 * Without an `errorElement` on the route tree, React Router falls back to
 * its OWN default boundary -- and that default ships in the production
 * build. A single bad value in one `site_content` row (a journey `body`
 * stored as a number, say) put this on screen for every visitor:
 *
 *     Unexpected Application Error!
 *     r.split is not a function
 *     TypeError: r.split is not a function
 *         at Mu (…/assets/index-jkEz6cBp.js:12:91095)   [+8 more frames]
 *     Hey developer 👋 You can provide a way better UX than this…
 *
 * A JavaScript stack trace, bundle line numbers, and a message addressed
 * to the developer -- shown to whoever the site is meant to impress.
 *
 * This replaces it with an apology, a way back, and nothing else. The real
 * error still reaches the console for whoever is debugging; it does not
 * reach the page. Deliberately dependency-free and styled with the same
 * container/utility classes the rest of the site uses, so that a failure
 * severe enough to reach here cannot itself fail to render.
 */
export default function RouteError() {
  const error = useRouteError();

  // The visitor gets none of this; the console gets all of it.
  console.error('Route error:', error);

  return (
    <div className="container py-5" role="alert">
      <h1 className="h3 mb-3">Something went wrong on this page</h1>
      <p className="lead mb-4">
        Sorry — this part of the site failed to load. Reloading usually fixes it.
      </p>
      <div className="d-flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload the page
        </button>
        {/* A full navigation, not a router link: the router is the thing
            that just failed, so routing within it is not a safe way out. */}
        <a className="btn btn-outline-primary" href="/">
          Back to the start
        </a>
      </div>
    </div>
  );
}
