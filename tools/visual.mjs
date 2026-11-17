// Object-only scene refresh with the original UI. Requires the dev server.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('captures', { recursive: true });
const base = process.env.URL || 'http://127.0.0.1:43123/';
const sizes = process.argv.includes('--quick') ? [[1440, 900], [375, 812]] : [[320, 740], [375, 812], [768, 1024], [1440, 900], [2560, 1440]];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const results = [];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text()); });
    await page.goto(base + '?mute=1');
    await page.waitForFunction(() => window.__game?.phase === 'title');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `captures/study-${width}-title.png` });
      await page.locator('#b-start').scrollIntoViewIfNeeded();
      const title = await page.evaluate(() => {
        const rect = document.getElementById('b-start').getBoundingClientRect();
      const card = document.getElementById('title').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, primaryVisible: rect.top >= card.top && rect.bottom <= Math.min(card.bottom, innerHeight), cardHeight: card.height };
    });
    assert.equal(title.overflow, false, `${width}: title horizontal overflow`);
    assert.equal(title.primaryVisible, true, `${width}: start button needs scrolling`);
    await page.locator('#b-mouse').click();
    await page.locator('#b-start').click();
    await page.waitForFunction(() => window.__game.phase === 'play');
    for (const view of ['angled', 'top']) {
      if (view === 'top') await page.locator('#b-view').click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `captures/study-${width}-${view}-play.png` });
      const play = await page.evaluate(() => {
        const g = window.__game;
        const points = [g.cell(0, 0), g.cell(8, 0), g.cell(0, 8), g.cell(8, 8), g.stock(0), g.stock(1)];
        const offscreen = points.filter((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1).length;
        const hud = document.getElementById('hud').getBoundingClientRect();
        const toggle = document.getElementById('b-view').getBoundingClientRect();
        const canvas = document.querySelector('#stage canvas');
        return { view: g.view, offscreen, toggleVisible: toggle.left >= 0 && toggle.right <= innerWidth && toggle.top >= 0 && toggle.bottom <= innerHeight, hudVisible: hud.left >= 0 && hud.right <= innerWidth && hud.bottom <= innerHeight, renderPixels: canvas.width * canvas.height, fps: g.fps };
      });
      assert.equal(play.view, view);
      assert.equal(play.toggleVisible, true, `${width}: view button outside viewport`);
      assert.equal(play.offscreen, 0, `${width}: board or fence rack outside viewport`);
      assert.equal(play.hudVisible, true, `${width}: HUD outside viewport`);
      assert.ok(play.renderPixels <= 2_000_000, `${width}: 3D pixel budget exceeded`);
      assert.deepEqual(errors, [], `${width}: browser errors`);
      results.push({ width, height, view, title, play, errors });
      console.log(JSON.stringify(results.at(-1)));
    }
    await context.close();
  }
  writeFileSync('captures/study-visual-report.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
