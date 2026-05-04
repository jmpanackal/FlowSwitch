import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version?: string };

const appVersion = String(packageJson?.version || '0.0.0').trim() || '0.0.0';

export default defineConfig({
  base: './',
  define: {
    __FLOWSWITCH_APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
});
