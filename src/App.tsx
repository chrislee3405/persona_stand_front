import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom' // for direct to diff pages

import Navbar from './components/navbar.tsx'
import Footer from './components/footer.tsx'
import ScrollToTop from './components/ScrollToTop.tsx'

import { ChatProvider } from './context/ChatContext.tsx'
import { ActiveSectionProvider } from './context/ActiveSectionContext.tsx'

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

      // Old per-page URLs still work -- redirect to the matching section anchor.
      // Projects no longer have their own pages: each opens as a bottom sheet
      // from its thumbnail in the Projects section, so any /projects/* URL
      // just lands on that section.
      { path: "aboutme", element: <Navigate to="/#about" replace /> },
      { path: "qualifications", element: <Navigate to="/#qualifications" replace /> },
      { path: "certifications", element: <Navigate to="/#certifications" replace /> },
      { path: "journey", element: <Navigate to="/#journey" replace /> },
      { path: "contact", element: <Navigate to="/#contact" replace /> },
      { path: "projects", element: <Navigate to="/#projects" replace /> },
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
    </ActiveSectionProvider>
  )
}


function App() {
  return (
    <ChatProvider> 
      <RouterProvider router={router} />
    </ChatProvider> 
    )
}

export default App