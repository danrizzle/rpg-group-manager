import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The engine is imported as workspace TS source; don't pre-bundle it so
  // edits to packages/engine hot-reload like app code.
  optimizeDeps: { exclude: ['@rpg/engine'] },
});
