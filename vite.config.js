import { defineConfig } from 'vite';

export default defineConfig({
  // Serve data/ and assets/ as static files from root
  publicDir: false,
  server: {
    port: 5173,
    open: false,
    // Expose node_modules for direct CSS import in dev
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: 'index.html',
    },
  },
  // Optimise MapLibre for faster cold starts
  optimizeDeps: {
    include: ['maplibre-gl', 'pmtiles'],
  },
});
