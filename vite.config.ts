import { defineConfig } from 'vite';

// The frontend is a static bundle served by the Hono Node server.
// There is no separate dev server: the app always runs on the assigned port 8106.
// React's automatic JSX runtime is handled by Vite's built-in esbuild transform,
// which keeps the dependency tree free of Babel/browserslist.
export default defineConfig({
  root: 'src/web',
  publicDir: 'public',
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    sourcemap: false,
  },
});
