// Screenshots of the game in GPU headless Chrome, so you (or your coding agent) can look at it without a webcam.
//   npm run capture              title, early and late play, results; asserts the bot caught something
//   npm run capture -- mobile    the same at phone size (390x844, touch)
// Needs the dev server running (npm run dev). URL=http://127.0.0.1:43123/ by default.
// Look at every image in captures/: a test passing does not mean the game looks right.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'captures');
mkdirSync(out, { recursive: true });
const BASE = process.env.URL || 'http://127.0.0.1:43123/';
const mobile = process.argv[2] === 'mobile';
const tag = mobile ? 'm-' : '';

// angle + metal is GPU rendering on macOS; elsewhere Chrome picks its own GL backend (drop --use-angle there)
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-gl=angle'];
const browser = await chromium.launch({ args: [...gpu, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const shot = async (name) => { await page.screenshot({ path: join(out, `${tag}${name}.png`) }); console.log('saved', `captures/${tag}${name}.png`); };
const game = () => page.evaluate(() => window.__game);

await page.goto(BASE + '?mute=1&seed=3');
await page.waitForTimeout(2000);
await shot('title');

// The bot plays a full game: a deliberate miss, then a race to the far rank.
await page.goto(BASE + '?bot=1&mute=1&seed=3');
await page.waitForTimeout(4000);
await shot('play-early');
await page.waitForTimeout(8000);
await shot('play-late');
await page.waitForFunction(() => window.__game.phase === 'results', null, { timeout: 45000 });
await page.waitForTimeout(1200);
await shot('results');
const g = await game();
console.log(JSON.stringify(g));

// the bot pinches to restart
const restarted = await page.waitForFunction(() => window.__game.phase === 'play', null, { timeout: 8000 }).then(() => true, () => false);

const ok = g.moves >= 8 && g.winner !== null && restarted && errors.length === 0;
if (errors.length) console.log('errors:\n  ' + errors.join('\n  '));
console.log(ok ? `OK: bot finished in ${g.moves} moves, winner ${g.winner}, restarted, no console errors` : 'FAILED');
process.exitCode = ok ? 0 : 1;
await browser.close();
