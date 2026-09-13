import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_CDN_BASE is REQUIRED, and the build fails without it.
  //
  // It is the single source for the CDN host, and it reaches three places
  // that cannot check each other: this bundle (via src/lib/assetUrl.ts),
  // index.html (via Vite's %VITE_CDN_BASE% substitution), and nginx's CSP
  // img-src/media-src (templated in the Dockerfile from this same value).
  //
  // Failing here rather than defaulting is the point. assetUrl.ts used to
  // carry a hardcoded fallback, so an unset variable still produced a bundle
  // whose images all worked -- while index.html, which has no fallback,
  // shipped the literal text `%VITE_CDN_BASE%` in its favicon, og:image and
  // hero preload URLs. Everything looked fine and the link previews were
  // broken. A build that cannot be correct should not complete.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (!env.VITE_CDN_BASE) {
    throw new Error(
      'VITE_CDN_BASE is not set.\n' +
      '  Local:  put VITE_CDN_BASE=https://<your-cloudfront-domain> in persona_stand_front/.env\n' +
      '  CI:     set the VITE_CDN_BASE repository Variable (the workflow writes it into .env before docker build)\n' +
      'It has no default on purpose -- see src/lib/assetUrl.ts.'
    )
  }

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] })
    ]
  }
})
