import { defineConfig } from "vite";
import { readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

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

// Generated static blog pages (see scripts/gen-blog.mjs). Same treatment as the
// colony pages above.
const blogPages = existsSync("blog")
  ? Object.fromEntries(
      readdirSync("blog")
        .filter((f) => f.endsWith(".html"))
        .map((f) => [
          `blog-${f === "index.html" ? "index" : f.replace(/\.html$/, "")}`,
          resolve("blog", f),
        ]),
    )
  : {};

// Dev-only: re-run the static generators when their source data changes, so
// editing a blog post (public/data/blog/*.md) or colony data
// (public/data/colonies-*.json) is reflected on save without restarting.
// The production build already runs the generators via `npm run gen`.
function generatorWatch() {
  const run = (script, label) => {
    try {
      execFileSync(process.execPath, [resolve("scripts", script)], {
        stdio: "inherit",
      });
    } catch (err) {
      console.error(`[gen] ${label} failed:`, err.message);
    }
  };
  // Coalesce bursty editor saves (many write the file twice).
  let timer;
  const debounce = (fn) => {
    clearTimeout(timer);
    timer = setTimeout(fn, 80);
  };
  return {
    name: "btc-generator-watch",
    apply: "serve",
    configureServer(server) {
      const reload = () => server.ws.send({ type: "full-reload" });
      const onChange = (file) => {
        const f = file.replace(/\\/g, "/");
        if (/\/public\/data\/blog\/.+\.md$/.test(f)) {
          debounce(() => {
            run("gen-blog.mjs", "blog");
            reload();
          });
        } else if (/\/public\/data\/colonies-.*\.json$/.test(f)) {
          debounce(() => {
            run("gen-colonies.mjs", "colonies");
            reload();
          });
        }
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

export default defineConfig({
  plugins: [generatorWatch()],
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
        ...blogPages,
      },
    },
  },
  // Optimise MapLibre for faster cold starts
  optimizeDeps: {
    include: ["maplibre-gl", "pmtiles"],
  },
});
