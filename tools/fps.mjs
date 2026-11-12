// Frame rate while the bot plays: npm run fps [-- <url> <dpr> <warmupSec> <sampleSec>]
// Target: 60 fps (p95 under 16.8 ms) at DPR 2, with headroom left for MediaPipe, which shares the GPU.
// Headless numbers are only meaningful on a quiet machine; close other heavy apps first.
import { chromium } from 'playwright';

const [, , url = 'http://127.0.0.1:43123/?bot=1&mute=1', dpr = '2', warm = '6', secs = '12'] = process.argv;
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-gl=angle'];
const browser = await chromium.launch({ args: [...gpu, '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(dpr) });
let glInvalid = 0;
page.on('console', (m) => { if (/GL_INVALID/.test(m.text())) glInvalid++; });
await page.goto(url);
await page.waitForTimeout(Number(warm) * 1000);
const r = await page.evaluate(async (ms) => {
  const t = []; const t0 = performance.now();
  await new Promise((res) => { const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  const pct = (p) => d[Math.floor(d.length * p)];
  return { fps: +(d.length / ((t.at(-1) - t[0]) / 1000)).toFixed(1), p50ms: +pct(0.5).toFixed(1), p95ms: +pct(0.95).toFixed(1), worstms: +d.at(-1).toFixed(1), gameDpr: window.__game?.dpr ?? null };
}, Number(secs) * 1000);
console.log(JSON.stringify({ ...r, glInvalid }));
await browser.close();
