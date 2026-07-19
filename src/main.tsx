import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

import 'bootstrap/dist/css/bootstrap.min.css'




// npm run dev
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)



// library installed
// npm i --save bootstrap @popperjs/core
// npm install react-bootstrap
// npm install react-router-dom