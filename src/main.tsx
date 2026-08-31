// CSS first, before any component -- so component stylesheets (e.g.
// Home.css, imported transitively by App) cascade AFTER Bootstrap and can
// override same-specificity rules like `.container` max-width.
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles.css'   // large-display (QHD/4K) tuning

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'




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