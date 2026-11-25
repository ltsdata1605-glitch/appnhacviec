// Tạo biểu tượng app và màn hình khởi động iPhone từ SVG bằng Chromium (Playwright).
// Chạy: node scripts/gen-assets.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const BLUE = '#2a83e9';
const BELL = `
  <circle cx="512" cy="244" r="36" fill="#fff"/>
  <path fill="#fff" d="M512 258c-116 0-190 94-190 214v126c0 42-20 74-48 102l-18 18c-20 20-7 52 21 52h470c28 0 41-32 21-52l-18-18c-28-28-48-60-48-102V472c0-120-74-214-190-214z"/>
  <path fill="#fff" d="M442 800h140c0 39-31 70-70 70s-70-31-70-70z"/>`;

const iconSvg = (size, { rounded = false, scale = 1 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a91f0"/>
      <stop offset="1" stop-color="${BLUE}"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0b3f8a" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="${rounded ? 230 : 0}" fill="url(#g)"/>
  <g filter="url(#s)" transform="translate(512 530) scale(${0.86 * scale}) translate(-512 -546)">${BELL}</g>
</svg>`;

const html = (body, w, h, bg) => `<!doctype html><html><head><style>
  html,body{margin:0;width:${w}px;height:${h}px;background:${bg};overflow:hidden}
  .c{width:100%;height:100%;display:grid;place-items:center}
</style></head><body><div class="c">${body}</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });

async function shot(file, w, h, content, bg = 'transparent') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html(content, w, h, bg));
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
  console.log('✓', file);
}

await shot('public/icons/apple-touch-icon.png', 180, 180, iconSvg(180), BLUE);
await shot('public/icons/icon-192.png', 192, 192, iconSvg(192, { rounded: true }));
await shot('public/icons/icon-512.png', 512, 512, iconSvg(512, { rounded: true }));
await shot('public/icons/icon-maskable-512.png', 512, 512, iconSvg(512, { scale: 0.78 }), BLUE);
await shot('public/icons/icon-1024.png', 1024, 1024, iconSvg(1024), BLUE);

const splashes = [
  [1320, 2868],
  [1290, 2796],
  [1206, 2622],
  [1179, 2556],
];
for (const [w, h] of splashes) {
  const s = 264; // 88pt @3x — trùng với màn hình chờ trong app
  const icon = `<div style="width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.225)}px;overflow:hidden;box-shadow:0 24px 72px rgba(42,131,233,.35)">${iconSvg(s)}</div>`;
  await shot(`public/splash/splash-${w}x${h}.png`, w, h, icon, '#f2f2f7');
  await shot(`public/splash/splash-${w}x${h}-dark.png`, w, h, icon, '#000000');
}
await browser.close();
