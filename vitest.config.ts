import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Independent of production CDN configuration: no application server, cloud
// credentials, or network access is needed for the frontend behavior suite.
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_CDN_BASE': JSON.stringify('https://cdn.example.test'),
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
});
