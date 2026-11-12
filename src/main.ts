/**
 * Wiring: input → rules → the wooden scene and the knocks.
 *
 * URL flags:
 *   ?bot=1         a synthetic player takes the pale pawn, through the real gesture engine
 *   ?autostart=1   skip the title (mouse)
 *   ?mute=1        no sound
 *   ?mode=hotseat  two people, passing the same hand
 *   ?speed=K       run K times faster
 */
import '@fontsource/fraunces/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/700.css';
import './style.css';
import { drawHand } from './hand-gesture-kit';
import { Input } from './input';
import { PinchLatch } from './pinch';
import { GrabLatch, RollLatch } from './grab';
import {
  createGame, fenceProblem, isLegalMove, legalMoves, releaseDrag, startGame, toggled,
  type Aim, type Mode, type Orientation,
} from './rules';
import { applyAction, chooseAction } from './ai';
import { Scene, type DragView } from './scene';
import { Sound } from './audio';
import { Bot } from './bot';

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';
const BEST_KEY = 'quoridor.shortest';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let queued: Mode = q.get('mode') === 'hotseat' ? 'hotseat' : 'ai';
const game = createGame(queued);
const scene = new Scene($('stage'));
const input = new Input($<HTMLVideoElement>('cam'), document.body);
const sound = new Sound();
const grab = new GrabLatch();
const latch = new PinchLatch();
const roll = new RollLatch();
const bot = flag('bot') ? new Bot() : null;
if (bot) queued = 'ai';
const speed = Number(q.get('speed')) || 1;
sound.muted = flag('mute');

let primed: Orientation = 'v';
let drag: DragView | null = null;
let aiLeft = -1;
let armAt = 0;
let resultsAt = 0;
let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* storage blocked */ }

function show(id: 'title' | 'results' | null) {
  for (const s of ['title', 'results']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id !== null);
}

function begin() {
  sound.start();
  startGame(game, queued);
  grab.reset();
  latch.reset();
  roll.reset();
  primed = 'v';
  drag = null;
  aiLeft = -1;
  armAt = performance.now() + 500;
  show(null);
  paintMode();
}

function finish() {
  sound.win();
  const ai = game.mode === 'ai';
  const you = game.winner === 0;
  const who = ai
    ? (you ? 'You reached the far rank.' : 'The machine reached your rank.')
    : (you ? 'Pale reached the far rank.' : 'Dark reached the near rank.');
  let line = `${who} ${game.moves} moves.`;
  if (ai && you) {
    const shorter = best === 0 || game.moves < best;
    if (shorter) {
      best = game.moves;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* ignore */ }
      line += ' Your shortest game.';
    } else line += ` Shortest win: ${best}.`;
  }
  $('r-score').textContent = String(game.moves);
  $('r-line').textContent = line;
  resultsAt = performance.now();
  show('results');
}

function paintMode() {
  $('m-ai').classList.toggle('on', queued === 'ai');
  $('m-hot').classList.toggle('on', queued === 'hotseat');
  $('m-ai').setAttribute('aria-pressed', String(queued === 'ai'));
  $('m-hot').setAttribute('aria-pressed', String(queued === 'hotseat'));
}

$('m-ai').addEventListener('click', () => { queued = 'ai'; paintMode(); });
$('m-hot').addEventListener('click', () => { queued = 'hotseat'; paintMode(); });
paintMode();

$('b-cam').addEventListener('click', async () => {
  sound.start();
  $('err').textContent = '';
  $('b-cam').textContent = 'Starting the camera…';
  try {
    await input.startCamera();
    $('preview').classList.remove('hidden');
    begin();
  } catch {
    $('b-cam').textContent = 'Use my camera';
    $('err').textContent = 'The camera is unavailable or was blocked. You can still play with the mouse or touch.';
  }
});
$('b-mouse').addEventListener('click', () => { input.setMode('pointer'); begin(); });
$('b-turn').addEventListener('click', () => input.requestRotate());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' && game.phase !== 'play') {
    if (input.mode === 'none') input.setMode('pointer');
    begin();
  }
  if (e.key === 'm' || e.key === 'M') sound.setMuted(!sound.muted);
});
addEventListener('resize', () => scene.resize());

if (bot) input.setMode('bot');
if (bot || flag('autostart')) { if (input.mode === 'none') input.setMode('pointer'); begin(); }
else show('title');

const pv = $<HTMLCanvasElement>('preview');
const pg = pv.getContext('2d')!;
function drawPreview() {
  if (input.mode !== 'camera') return;
  const v = input.hands.video;
  const w = pv.width;
  const h = pv.height;
  pg.save();
  pg.scale(-1, 1);
  pg.drawImage(v, -w, 0, w, h);
  pg.restore();
  if (input.hand) drawHand(pg, input.hand.landmarks, w, h, { color: '#ffe9cf', lineWidth: 2, jointRadius: 2 });
}

function aimOf(kind: DragView['kind'], hit: { cell: { c: number; r: number } | null; slot: { c: number; r: number } | null } | null): Aim {
  if (!hit) return { kind: 'none' };
  if (kind === 'pawn' && hit.cell) return { kind: 'cell', c: hit.cell.c, r: hit.cell.r };
  if (kind === 'fence' && hit.slot) return { kind: 'slot', c: hit.slot.c, r: hit.slot.r };
  return { kind: 'none' };
}

let last = performance.now();
let t = 0;
let fps = 60;
function frame(now: number) {
  requestAnimationFrame(frame);
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (real > 0) fps += (1 / real - fps) * 0.05;
  const dt = real * speed;
  t += dt;

  if (bot) {
    input.bot = bot.update(game, dt, {
      cell: (c, r) => scene.cellToScreen(c, r),
      slot: (c, r) => scene.slotToScreen(c, r),
      stock: (p) => scene.stockToScreen(p),
    }, scene.aspect);
  }
  input.update(dt);
  const h = input.hand;
  const point = h ? scene.boardPoint(h.screen.x, h.screen.y) : null;
  const hit = point ? scene.classify(point.x, point.z, game.pawns) : null;
  const human = game.phase === 'play' && (game.mode === 'hotseat' || game.turn === 0);
  const useRoll = input.mode === 'camera' || input.mode === 'bot';

  if (input.consumeRotate()) {
    if (drag?.kind === 'fence') { drag.o = toggled(drag.o); drag.manual = true; }
    else primed = toggled(primed);
  }
  // A manual turn (right-click, R, the button) sticks for this carry. Palm roll keeps driving otherwise.
  if (drag?.kind === 'fence' && useRoll && h && !drag.manual) {
    drag.o = roll.update(h.roll);
  }

  const edge = grab.update(h ? { pinch: h.pinch, openness: h.openness, pose: h.pose } : null, dt);
  const armed = now >= armAt;
  if (armed && human && edge === 'grab' && hit && !drag) {
    if (hit.pawn === game.turn) {
      drag = { kind: 'pawn', o: 'v', x: hit.x, z: hit.z, legal: false, cell: null, slot: null, owner: game.turn, manual: false };
      sound.lift();
    } else if (hit.stock === game.turn && game.remaining[game.turn] > 0) {
      const o = useRoll ? roll.o : primed;
      drag = { kind: 'fence', o, x: hit.x, z: hit.z, legal: false, cell: null, slot: null, owner: game.turn, manual: !useRoll };
      sound.lift();
    }
  }
  if (drag && hit) {
    drag.x = hit.x;
    drag.z = hit.z;
    drag.cell = hit.cell;
    drag.slot = hit.slot;
    drag.legal = drag.kind === 'pawn'
      ? !!hit.cell && isLegalMove(game, hit.cell)
      : !!hit.slot && fenceProblem(game, { c: hit.slot.c, r: hit.slot.r, o: drag.o }) === null;
  }
  if (edge === 'release' && drag) {
    if (human) {
      const res = releaseDrag(game, drag.kind === 'pawn' ? { kind: 'pawn' } : { kind: 'fence', o: drag.o }, aimOf(drag.kind, hit));
      if (res.ok) {
        sound.down(drag.kind);
        if (game.phase === 'results') finish();
        else if (game.mode === 'ai' && game.turn === 1) aiLeft = 0.32;
      } else sound.no();
    }
    drag = null;
  } else if (edge === 'cancel' && drag) {
    drag = null;
    sound.no();
  }

  const thinking = game.mode === 'ai' && game.phase === 'play' && game.turn === 1 && !drag;
  if (thinking) {
    if (aiLeft < 0) aiLeft = 0.32;
    aiLeft -= dt;
    if (aiLeft <= 0) {
      const action = chooseAction(game);
      if (action && applyAction(game, action)) {
        sound.down(action.type === 'pawn' ? 'pawn' : 'fence');
        if (game.phase === 'results') finish();
      }
      aiLeft = -1;
    }
  } else if (game.turn !== 1) aiLeft = -1;

  const pinchEdge = latch.update(h ? h.pinch : 0);
  if (pinchEdge === 'press' && game.phase === 'results' && now - resultsAt > 1500) begin();

  const showLegal = human && drag?.kind !== 'fence';
  const legal = showLegal ? legalMoves(game, game.turn) : [];
  scene.render({
    pawns: game.pawns,
    fences: game.fences,
    remaining: game.remaining,
    turn: game.turn,
    legal,
    showLegal,
    drag,
    cursor: hit ? { x: hit.x, z: hit.z, pinch: h?.pinch ?? 0 } : null,
    thinking,
    dt,
    t,
  });
  paintHud(thinking);
  drawPreview();
}
requestAnimationFrame(frame);

function paintHud(thinking: boolean) {
  const ai = game.mode === 'ai';
  $('name-0').textContent = ai ? 'You' : 'Pale';
  $('name-1').textContent = ai ? 'Machine' : 'Dark';
  $('fences-0').textContent = `${game.remaining[0]} fences`;
  $('fences-1').textContent = `${game.remaining[1]} fences`;
  $('side-0').classList.toggle('live', game.phase === 'play' && game.turn === 0);
  $('side-1').classList.toggle('live', game.phase === 'play' && game.turn === 1);
  let turn = thinking ? 'The machine is choosing' : game.turn === 0
    ? (ai ? 'Your turn' : "Pale's turn")
    : (ai ? "Machine's turn" : "Dark's turn");
  if (drag?.kind === 'pawn') turn = drag.legal ? 'Open your hand on the green square' : 'That square is closed';
  if (drag?.kind === 'fence') turn = drag.legal ? 'Open your hand to set the fence' : 'That fence will not sit there';
  $('turn').textContent = turn;
  const o = drag?.kind === 'fence' ? drag.o : primed;
  $('b-turn').textContent = o === 'h' ? 'Fence is horizontal' : 'Fence is vertical';
  $('b-turn').classList.toggle('hidden', game.phase !== 'play' || input.mode === 'camera' || input.mode === 'bot');
}

Object.defineProperty(window, '__game', {
  get: () => ({
    phase: game.phase,
    mode: game.mode,
    turn: game.turn,
    winner: game.winner,
    moves: game.moves,
    pawns: game.pawns.map((p) => ({ ...p })),
    remaining: [...game.remaining],
    fences: game.fences.length,
    holding: drag ? { kind: drag.kind, o: drag.o, legal: drag.legal } : null,
    input: input.mode,
    hand: input.hand ? { x: input.hand.screen.x, y: input.hand.screen.y, pinch: input.hand.pinch, roll: input.hand.roll } : null,
    fps: Math.round(fps),
    dpr: scene.renderer.getPixelRatio(),
    best,
    cell: (c: number, r: number) => scene.cellToScreen(c, r),
    slot: (c: number, r: number) => scene.slotToScreen(c, r),
    stock: (p: 0 | 1) => scene.stockToScreen(p),
  }),
});
