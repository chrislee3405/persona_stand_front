// CSS first, before any component -- so component stylesheets (e.g.
// Home.css, imported transitively by App) cascade AFTER Bootstrap and can
// override same-specificity rules like `.container` max-width.
import './bootstrap.scss'   // curated Bootstrap build -- see the file for what is in it and why
import '@fontsource-variable/inter'   // Inter (variable weight axis) -- set as the app font in styles.css
import './styles.css'   // global type scale + large-display (QHD/4K) tuning

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
