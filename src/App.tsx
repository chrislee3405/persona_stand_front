import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom' // for direct to diff pages

import { SECTIONS } from './lib/knobs.ts'

import Navbar from './components/navbar.tsx'
import Footer from './components/footer.tsx'
import ScrollToTop from './components/ScrollToTop.tsx'
import ChatLauncher from './components/ChatLauncher.tsx'

import { ChatProvider } from './context/ChatContext.tsx'
import { ActiveSectionProvider } from './context/ActiveSectionContext.tsx'
import { SiteContentProvider } from './context/SiteContentProvider.tsx'

import Home from './pages/Home.tsx'
import Chatroom from './pages/Chatroom.tsx'



// 2. Map URL path patterns to the page components
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />, // Always keeps Navbar and Footer visible
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
      <Navbar />
      {/* This container holds whatever page component is currently selected */}
      <div className="container py-4 px-3 mx-auto" style={{ minHeight: '80vh' }}>
        <Outlet /> {/* <-- This is the window where the pages swap out! */}
      </div>
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
        <RouterProvider router={router} />
      </SiteContentProvider>
    </ChatProvider>
    )
}

export default App