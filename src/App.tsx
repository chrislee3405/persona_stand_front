import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom' // for direct to diff pages
import './App.css'

import Navbar from './components/navbar.tsx'
import Footer from './components/footer.tsx'

import Qualifications from './pages/Qualifications.tsx'
import Journey from './pages/Journey.tsx'
import Contact from './pages/Contact.tsx'
import RansomSimulator from './pages/RansomSimulator.tsx'
import CarRental from './pages/CarRental.tsx'
import AboutMe from './pages/AboutMe.tsx'
import Chatroom from './pages/Chatroom.tsx'



// 2. Map URL path patterns to the page components
const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />, // Always keeps Navbar and Footer visible
    children: [
        // Default homepage
      {path: "/", element: (<AboutMe />)},

      { path: "aboutme", element: <AboutMe /> },
      { path: "qualifications", element: <Qualifications /> },
      { path: "journey", element: <Journey /> },
      { path: "projects/ransom-simulator", element: <RansomSimulator /> },
      { path: "projects/car-rental", element: <CarRental /> },
      { path: "contact", element: <Contact /> },
      { path: "chatroom", element: <Chatroom /> },
    ]
  }
])



// Global Layout Wrapper
function RootLayout() {
  return (
    <>
      <Navbar />
      {/* This container holds whatever page component is currently selected */}
      <div className="container py-4 px-3 mx-auto" style={{ minHeight: '80vh' }}>
        <Outlet /> {/* <-- This is the window where the pages swap out! */}
      </div>
      <Footer />
    </>
  )
}


function App() {
  return <RouterProvider router={router} />
}

export default App