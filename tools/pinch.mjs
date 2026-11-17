// Synthetic camera landmarks → real input, gesture engine, grab latch and board rules.
// Needs the dev server; CHROMIUM_PATH can select an installed Chrome.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Access the real input only in this test response, without adding a production API.
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nwindow.__testInput = input;\n' });
  });
  await page.goto((process.env.URL || 'http://127.0.0.1:43123/') + '?autostart=1&mute=1&mode=hotseat&seed=42');
  await page.waitForFunction(() => window.__testInput && window.__game?.phase === 'play').catch((e) => {
    throw new Error(`${e.message}; page errors: ${errors.join('; ')}`);
  });
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const video = window.__testInput.hands.video;
    video.muted = true;
    video.srcObject = canvas.captureStream(30);
    canvas.getContext('2d').fillRect(0, 0, 640, 360);
    await video.play();
    window.__testInput.setMode('camera');
    window.__testInput.update = () => {};
  });
  await page.waitForTimeout(700);
  if (process.argv.includes('--top')) {
    await page.locator('#b-view').click();
    assert.equal((await page.evaluate(() => window.__game)).view, 'top');
  }
  const point = (kind, ...args) => page.evaluate(({ kind, args }) => window.__game[kind](...args), { kind, args });
  const state = () => page.evaluate(() => window.__game);
  mkdirSync('captures', { recursive: true });
  const pose = async (at, pinch, fist = false) => {
    await page.evaluate(async ({ at, pinch, fist }) => {
      const kit = await import('/src/hand-gesture-kit/index.ts');
      const { REGION } = await import('/src/input.ts');
      const c = kit.fromScreen(at, REGION);
      const shape = fist ? kit.SYNTHETIC_POSES.fist : { curl: [0, 0.5, 1, 1, 1], pinch };
      const rest = kit.screenHandLandmarks(c.x, c.y, { curl: [0, 0.5, 1, 1, 1], pinch: 0 });
      const landmarks = kit.screenHandLandmarks(c.x, c.y, shape);
      const dx = rest[0].x - landmarks[0].x, dy = rest[0].y - landmarks[0].y;
      window.__testInput.hands.inject([{ landmarks: landmarks.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })), handedness: 'Right' }]);
    }, { at, pinch, fist });
    await page.waitForTimeout(500);
  };

  const pawn = await point('cell', 4, 0);
  await pose(pawn, 0, true);
  assert.equal((await state()).holding, null, 'a fist must not grab');
  await pose(pawn, 0);
  await pose(await point('cell', 0, 4), 1);
  assert.equal((await state()).holding, null, 'pinching empty space must not take a piece');
  await pose(pawn, 1);
  assert.equal((await state()).holding?.kind, 'pawn', 'moving a pinch onto the pawn must pick it up');
  await pose(await point('cell', 4, 1), 1);
  assert.equal((await state()).holding?.legal, true);
  // Finger separation moves the midpoint. The last held square must remain the drop target.
  await pose({ x: 0.05, y: 0.05 }, 0);
  assert.deepEqual((await state()).pawns[0], { c: 4, r: 1 });
  assert.equal((await state()).holding, null, 'separating just two fingers must release');

  await pose(await point('stock', 1), 0);
  await pose(await point('stock', 1), 1);
  assert.equal((await state()).holding?.kind, 'fence');
  await pose(await point('slot', 2.3, 3), 1);
  assert.equal((await state()).holding?.legal, true);
  assert.equal((await state()).holding?.o, 'h', 'aiming along a horizontal gap turns the fence without wrist rotation');
  await page.screenshot({ path: 'captures/fence-horizontal.png' });
  await pose(await point('slot', 2, 3.3), 1);
  assert.equal((await state()).holding?.o, 'v', 'aiming along a vertical gap turns it back');
  await page.screenshot({ path: 'captures/fence-vertical.png' });
  await pose(await point('slot', 2, 3), 1);
  assert.equal((await state()).holding?.o, 'v', 'crossing the intersection keeps the previous direction');
  await pose({ x: 0.05, y: 0.05 }, 0);
  assert.equal((await state()).fences, 1);
  assert.equal((await state()).remaining[1], 9);

  // Re-enter with separated fingers so a newly identified hand can establish its grip offset.
  await pose(await point('cell', 4, 1), 0);
  await pose(await point('cell', 4, 1), 1);
  assert.equal((await state()).holding?.kind, 'pawn');
  await page.keyboard.press('v');
  await page.waitForTimeout(100);
  assert.equal((await state()).holding, null, 'switching view cancels the carry');
  await pose(await point('cell', 4, 1), 1);
  assert.equal((await state()).holding, null, 'a closed hand must not re-grab in the new view');
  assert.equal((await state()).moves, 2, 'switching view does not place a piece or spend a turn');
  await pose(await point('cell', 4, 1), 0);
  await pose(await point('cell', 4, 1), 1);
  assert.equal((await state()).holding?.kind, 'pawn', 'opening the hand allows pickup again');
  await page.evaluate(() => window.__testInput.hands.inject([]));
  await page.waitForTimeout(600);
  assert.equal((await state()).holding, null, 'a lost hand cancels instead of placing');
  assert.equal((await state()).moves, 2);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'captures/pinch-play.png' });
  console.log('OK: fingertip pickup, no fist pickup, pickup after empty-space pinch, two-finger release, automatic fence direction, stable crossing, fence placement, lost-hand cancellation');
} finally {
  await browser.close();
}
