import { defineConfig } from "vite";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Generated static colony pages (see scripts/gen-colonies.mjs). Added as Vite
// inputs so their CSS/JS get bundled like the other pages.
const colonyPages = existsSync("colonies")
  ? Object.fromEntries(
      readdirSync("colonies")
        .filter((f) => f.endsWith(".html"))
        .map((f) => [
          `col-${f === "index.html" ? "dir" : f.replace(/\.html$/, "")}`,
          resolve("colonies", f),
        ]),
    )
  : {};

export default defineConfig({
  plugins: [],
  publicDir: "public",
  server: {
    port: 5173,
    open: false,
    // Expose node_modules for direct CSS import in dev
    fs: { allow: [".."] },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: "index.html",
        map: "map.html",
        ...colonyPages,
      },
    },
  },
  // Optimise MapLibre for faster cold starts
  optimizeDeps: {
    include: ["maplibre-gl", "pmtiles"],
  },
});
