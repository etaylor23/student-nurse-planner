// Authoring-time asset generator. Renders the branded OG image + PNG app icons from
// inline SVG using sharp (bundled with Astro). Run once with `npm run og`; the PNGs are
// committed to public/ (not part of the build). Social platforms require RASTER og:image
// (SVG is not rendered by Facebook/X/LinkedIn), hence PNG. Keep the mark art in sync with
// src/components/Logo.astro + public/favicon.svg.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(join(pub, "og"), { recursive: true });

const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif";

// The pin+check mark, parameterised by size + corner radius (0 = full-bleed for iOS).
const mark = (size, radius) => `
  <rect width="${size}" height="${size}" rx="${radius}" fill="#059669"/>
  <g transform="translate(${size * 0.09} ${size * 0.09}) scale(${(size * 0.82) / 32})">
    <path d="M16 3c-4.7 0-8.5 3.8-8.5 8.5 0 5.9 7 12.8 8 13.6.3.3.7.3 1 0 1-.8 8-7.7 8-13.6C24.5 6.8 20.7 3 16 3Z" fill="#fff" fill-opacity="0.22"/>
    <path d="m11.4 12.2 3 3 5.6-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ecfdf5"/>
      <stop offset="0.5" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="10" fill="#059669"/>

  <!-- brand lockup -->
  <g transform="translate(80 70)">
    <g transform="translate(0 0)">${mark(56, 14)}</g>
    <text x="72" y="40" font-family="${FONT}" font-size="34" font-weight="700" fill="#0f172a">Place<tspan fill="#059669">Mate</tspan></text>
  </g>

  <!-- headline -->
  <text x="80" y="270" font-family="${FONT}" font-size="76" font-weight="800" fill="#0f172a" letter-spacing="-2">The planner for</text>
  <text x="80" y="356" font-family="${FONT}" font-size="76" font-weight="800" fill="#0f172a" letter-spacing="-2">UK student nurses</text>

  <!-- subline -->
  <text x="80" y="430" font-family="${FONT}" font-size="34" font-weight="600" fill="#047857">Placement hours · NMC proficiencies · shifts · revision</text>

  <!-- footer -->
  <text x="80" y="560" font-family="${FONT}" font-size="30" font-weight="700" fill="#0f172a">placemate.uk</text>
  <text x="1120" y="560" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="600" fill="#64748b">Free for student nurses</text>

  <!-- decorative faded mark -->
  <g transform="translate(890 150)" opacity="0.10">${mark(260, 64)}</g>
</svg>`;

const iconSvg = (size, radius) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${mark(size, radius)}</svg>`;

async function run() {
  await sharp(Buffer.from(ogSvg)).png().toFile(join(pub, "og", "default.png"));
  // Organization.logo — rounded mark on transparent.
  await sharp(Buffer.from(iconSvg(512, 112))).png().toFile(join(pub, "icon-512.png"));
  // apple-touch-icon — full-bleed (iOS masks its own corners).
  await sharp(Buffer.from(iconSvg(180, 0))).png().toFile(join(pub, "apple-touch-icon.png"));
  console.log("Generated: og/default.png, icon-512.png, apple-touch-icon.png");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
