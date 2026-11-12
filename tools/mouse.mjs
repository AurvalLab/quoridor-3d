// Mouse fallback: drag the pale pawn one square forward, then drag a fence onto the board.
// Needs the dev server (npm run dev). URL=http://127.0.0.1:43123/ by default.
import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://127.0.0.1:43123/';
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-gl=angle'];
const browser = await chromium.launch({
  args: [...gpu, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const W = 1440, H = 900;
const px = (p) => ({ x: p.x * W, y: p.y * H });
const game = () => page.evaluate(() => window.__game);

await page.goto(BASE + '?autostart=1&mute=1&mode=ai');
await page.waitForFunction(() => window.__game?.phase === 'play');
await page.waitForTimeout(400);

const pawn = px(await page.evaluate(() => window.__game.cell(4, 0)));
const step = px(await page.evaluate(() => window.__game.cell(4, 1)));
const stock = px(await page.evaluate(() => window.__game.stock(0)));
const slot = px(await page.evaluate(() => window.__game.slot(2, 3)));
console.log('targets', { pawn, step, stock, slot });

async function drag(from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.waitForTimeout(280);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

await drag(pawn, step);
const afterMove = await game();
console.log('after pawn', JSON.stringify({ pawns: afterMove.pawns, turn: afterMove.turn, moves: afterMove.moves, holding: afterMove.holding }));

// The machine takes a turn. Wait until it is ours again, then place a horizontal fence.
await page.waitForFunction(() => window.__game.turn === 0 && window.__game.phase === 'play', null, { timeout: 4000 }).catch(() => {});
await page.keyboard.press('r');
await drag(stock, slot);
await page.screenshot({ path: 'captures/mouse-play.png' });
const afterFence = await game();
console.log('after fence', JSON.stringify({
  remaining: afterFence.remaining, fences: afterFence.fences, turn: afterFence.turn, moves: afterFence.moves, holding: afterFence.holding,
}));

// Right-click while carrying should flip the preview orientation.
const again = px(await page.evaluate(() => window.__game.stock(0)));
await page.mouse.move(again.x, again.y);
await page.mouse.down();
await page.waitForTimeout(350);
const held = await game();
await page.keyboard.press('r');
await page.waitForTimeout(120);
const afterKey = await game();
await page.mouse.down({ button: 'right' });
await page.mouse.up({ button: 'right' });
await page.waitForTimeout(120);
const afterRight = await game();
await page.mouse.up();
await page.waitForTimeout(200);
console.log('rotate', { before: held.holding, afterKey: afterKey.holding, afterRight: afterRight.holding });

const keyFlipped = held.holding?.kind === 'fence' && afterKey.holding?.o && afterKey.holding.o !== held.holding.o;
const rightFlipped = afterKey.holding?.o && afterRight.holding?.o && afterRight.holding.o !== afterKey.holding.o;
const ok = afterMove.pawns[0].r === 1 && afterMove.moves >= 1
  && afterFence.fences >= 1 && afterFence.remaining[0] === 9
  && keyFlipped && rightFlipped
  && errors.length === 0;
if (errors.length) console.log('errors:\n  ' + errors.join('\n  '));
console.log(ok ? 'OK: mouse drag, fence, and rotate' : 'FAILED');
process.exitCode = ok ? 0 : 1;
await browser.close();
