import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom' // for direct to diff pages

import { SECTIONS, RETIRED_SECTIONS } from './lib/knobs.ts'

import Navbar from './components/navbar.tsx'
import Footer from './components/footer.tsx'
import ScrollToTop from './components/ScrollToTop.tsx'
import ChatLauncher from './components/ChatLauncher.tsx'
import RouteError from './components/RouteError.tsx'
import DocumentHead from './components/DocumentHead.tsx'

import { ChatProvider } from './context/ChatContext.tsx'
import { ActiveSectionProvider } from './context/ActiveSectionContext.tsx'
import { SiteContentProvider } from './context/SiteContentProvider.tsx'

import Home from './pages/Home.tsx'

// Split out of the main bundle. The chatroom is a whole second page --
// Chatroom.tsx, useChatDispatch.ts and a 582-line stylesheet -- and the
// home page is where essentially all traffic lands, so shipping the chat
// to every visitor who never opens it is pure weight. Home stays eagerly
// imported: it IS the landing route, and lazy-loading it would only add a
// round trip in front of the thing everyone came for.
const Chatroom = lazy(() => import('./pages/Chatroom.tsx'))



// 2. Map URL path patterns to the page components
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />, // Always keeps Navbar and Footer visible
    // Catches anything thrown while rendering any child route. Without it
    // React Router falls back to its own default boundary, which ships in
    // the production build and prints a raw stack trace at the visitor --
    // see RouteError for what that looked like.
    errorElement: <RouteError />,
    children: [
      // About Me, Qualifications & Awards, Certifications and Journey are now
      // one scrolling page.
      { path: "/", element: <Home /> },

      // Old per-page URLs still work -- redirect to the matching section
      // anchor. Generated from the one SECTIONS list (lib/knobs.ts) that the
      // navbar and Home's scroll-spy also read, so a new section gets its
      // redirect for free.
      ...SECTIONS.map(s => ({
        path: s.id,
        element: <Navigate to={`/#${s.id}`} replace />,
      })),

      // Sections that were merged away still have live URLs in the wild --
      // send them to whichever section absorbed them.
      ...RETIRED_SECTIONS.map(s => ({
        path: s.id,
        element: <Navigate to={`/#${s.redirectTo}`} replace />,
      })),

      // Two paths that don't follow the `/<section id>` pattern: the old
      // About URL used a different slug, and projects had per-project pages.
      // Projects no longer have their own pages -- each opens as a bottom
      // sheet from its thumbnail -- so any /projects/* URL lands on the
      // section too.
      { path: "aboutme", element: <Navigate to="/#about" replace /> },
      { path: "projects/:slug", element: <Navigate to="/#projects" replace /> },

      { path: "chatroom", element: <Chatroom /> },
    ]
  }
])



// Global Layout Wrapper
function RootLayout() {
  return (
    <ActiveSectionProvider>
      <ScrollToTop />
      {/* First thing in the tab order: lets keyboard and screen-reader users
          jump the six nav items straight to the content. Visually hidden
          until focused (see .skip-link). */}
      <a className="skip-link" href="#main">Skip to content</a>
      <Navbar />
      {/* <main> so assistive tech has a "main content" landmark to jump to --
          this was a plain <div> and the document had no landmark at all. */}
      <main id="main" className="container py-4 px-3 mx-auto" style={{ minHeight: '80vh' }}>
        {/* Required by the lazy chatroom route. The fallback is deliberately
            empty rather than a spinner: the chunk is small and usually
            already cached, and a spinner that flashes for 80ms reads as a
            fault. An empty region for a moment reads as loading -- the same
            reasoning as <SectionState>. */}
        <Suspense fallback={null}>
          <Outlet /> {/* <-- This is the window where the pages swap out! */}
        </Suspense>
      </main>
      <Footer />
      {/* Outside the page container on purpose: it is position:fixed, and a
          transformed/filtered ancestor would make it fixed to THAT box
          instead of the viewport. Hides itself on /chatroom. */}
      <ChatLauncher />
    </ActiveSectionProvider>
  )
}


function App() {
  return (
    <ChatProvider>
      {/* Outside RouterProvider so the site copy is fetched once per visit
          and survives every route change -- pages read it from context
          instead of each making their own request. */}
      <SiteContentProvider>
        {/* Rewrites <title>, the meta description and the og:* tags from
            the personal_statement row once it loads, so index.html can
            ship only generic fallbacks. Renders nothing. Inside the
            provider so it can read the context, outside the router so it
            is route-independent. */}
        <DocumentHead />
        <RouterProvider router={router} />
      </SiteContentProvider>
    </ChatProvider>
    )
}

export default App
