import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  publicDir: 'public',
  server: {
    port: 5173,
    open: false,
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: 'index.html',
    },
  },
});
