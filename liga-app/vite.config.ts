import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' -> läuft in jedem Unterordner (GitHub Pages, Netlify, eigener Server)
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
