// One-off maintainer tool: optimise colony photos to web-ready WebP.
// Reads images from a source dir (default 0/photos), downsizes to a max width
// (no upscaling) and writes WebP into public/assets/images/colonies/.
//
//   node scripts/optimize-photos.mjs [srcDir] [maxWidth] [quality]
//
// Requires `cwebp` on PATH (brew install webp). Then reference the output in a
// colony's `photos` array, e.g. "/assets/images/colonies/terra-kikinda.webp".

import { readdirSync, readFileSync, statSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, process.argv[2] || "0/photos");
const maxW = Number(process.argv[3] || 1600);
const quality = Number(process.argv[4] || 82);
const outDir = resolve(root, "public/assets/images/colonies");

// Minimal JPEG/PNG width reader so we never upscale small originals.
function imageWidth(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return buf.readUInt32BE(16); // PNG IHDR
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length - 8) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return buf.readUInt16BE(o + 7); // SOF: ...precision(1) height(2) width(2)
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return null;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

if (!existsSync(srcDir)) {
  console.error(`No source dir: ${srcDir}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const images = readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!images.length) {
  console.log(`No images in ${srcDir}`);
  process.exit(0);
}

for (const file of images) {
  const input = resolve(srcDir, file);
  const name = basename(file, extname(file));
  const output = resolve(outDir, `${name}.webp`);
  const buf = readFileSync(input);
  const width = imageWidth(buf);

  const args = ["-quiet", "-q", String(quality)];
  if (width && width > maxW) args.push("-resize", String(maxW), "0");
  args.push(input, "-o", output);

  try {
    execFileSync("cwebp", args, { stdio: "inherit" });
  } catch (err) {
    console.error(`cwebp failed for ${file} — is it installed? (${err.message})`);
    continue;
  }
  const before = statSync(input).size;
  const after = statSync(output).size;
  console.log(
    `${file}  (${width || "?"}px, ${kb(before)}) -> ${name}.webp  (${kb(after)}, -${Math.round((1 - after / before) * 100)}%)`,
  );
}

console.log(`\nDone → ${outDir}`);
console.log('Reference in the colony JSON, e.g.  "photos": ["/assets/images/colonies/<name>.webp"]');
