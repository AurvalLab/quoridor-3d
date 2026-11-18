/**
 * Wiring: input → rules → the wooden scene and the knocks.
 *
 * URL flags:
 *   ?bot=1         a synthetic player takes the pale pawn, through the real gesture engine
 *   ?autostart=1   skip the title (mouse)
 *   ?mute=1        no sound
 *   ?mode=hotseat  two people, passing the same hand
 *   ?speed=K       run K times faster
 *   ?seed=N        reproducible opening dice for the first game
 */
import '@fontsource/fraunces/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/700.css';
import './style.css';
import { drawHand } from './hand-gesture-kit';
import { Input } from './input';
import { PinchLatch } from './pinch';
import { GrabLatch, RELEASE_HOLD_S, RollLatch } from './grab';
import {
  createGame, fenceProblem, isLegalMove, legalMoves, other, releaseDrag, startGame, toggled,
  type Aim, type Mode, type Orientation, type Player,
} from './rules';
import { applyAction, chooseAction } from './ai';
import { fenceOrientation, Scene, slotCenter, type DragView } from './scene';
import { Sound } from './audio';
import { Bot } from './bot';
import { setupInstructions } from './instructions';
import { Online } from './online';
import { setupRoomUI } from './room-ui';
import { clockValues, createClock, formatTime, syncClock, type Clock } from './clock';
import { DiceRoll, openingCaption, seedFor } from './dice';

const q = new URLSearchParams(location.search);
const flag = (k: string) => q.get(k) === '1';
const BEST_KEY = 'quoridor.shortest';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const instructions = setupInstructions($('title'));
const online = new Online();
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
let pendingPawn: { owner: Player; cell: { c: number; r: number } } | null = null;
const simulations = { novice: 2500, average: 7500, good: 20000 } as const;
let difficulty: keyof typeof simulations = 'novice';
let aiWorker: Worker | null = null;
let armAt = 0;
let resultsAt = 0;
let viewNeedsRelease = false;
let best = 0;
let localClock = createClock();
let remoteClock: Clock = createClock();
let controlChoice: 'camera' | 'pointer' = 'pointer';
let cameraStarting = false;
let controlRequest = 0;
let openingRoll: DiceRoll | null = null;
let humanSide: Player = 0;
let rollKey = '';
let diceSoundAt = 0;
let urlSeed: number | null = q.has('seed') && Number.isFinite(Number(q.get('seed')))
  ? Number(q.get('seed')) >>> 0
  : flag('easter') ? seedFor(0, true) : null;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* storage blocked */ }

type Spark = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
const fwCanvas = $<HTMLCanvasElement>('fireworks');
const fwCtx = fwCanvas.getContext('2d')!;
const FW_COLORS = ['#ffdf78', '#f6efe2', '#6fd4be', '#ff9f7a', '#ffe8a8'];
let sparks: Spark[] = [];
let fwBurstAt = 0;
let easterActive = false;
let easterAt = 0;

function spawnFirework(cx: number, cy: number, soundScale = 0.5) {
  const count = reduceMotion ? 16 : 42;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const speed = (reduceMotion ? 30 : 120) + Math.random() * (reduceMotion ? 50 : 210);
    sparks.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.65,
      color: FW_COLORS[i % FW_COLORS.length],
      size: 2.2 + Math.random() * 2.4,
    });
  }
  sound.firework(soundScale);
}

function hideEasterEgg() {
  if (!easterActive && sparks.length === 0) return;
  easterActive = false;
  sparks = [];
  $('easter-egg').classList.add('hidden');
  fwCanvas.classList.add('hidden');
  fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height);
}

function updateFireworks(dt: number, now: number) {
  const standing = !!openingRoll?.edgeStand;
  if (standing && !easterActive) {
    easterActive = true;
    easterAt = now;
    fwBurstAt = now;
    $('easter-egg').classList.remove('hidden');
    fwCanvas.classList.remove('hidden');
    spawnFirework(innerWidth * 0.3, innerHeight * 0.28, 1);
    spawnFirework(innerWidth * 0.7, innerHeight * 0.26, 0.7);
  } else if (!standing && easterActive) {
    hideEasterEgg();
  }
  if (!easterActive) return;

  const ratio = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(innerWidth * ratio));
  const h = Math.max(2, Math.round(innerHeight * ratio));
  if (fwCanvas.width !== w || fwCanvas.height !== h) {
    fwCanvas.width = w;
    fwCanvas.height = h;
  }
  if (!reduceMotion && now - fwBurstAt > 520) {
    fwBurstAt = now;
    spawnFirework(
      innerWidth * (0.18 + Math.random() * 0.64),
      innerHeight * (0.14 + Math.random() * 0.32),
      0.42,
    );
  }
  fwCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  fwCtx.clearRect(0, 0, innerWidth, innerHeight);
  const next: Spark[] = [];
  for (const p of sparks) {
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    if (!reduceMotion) {
      p.vy += 170 * dt;
      p.vx *= Math.exp(-1.4 * dt);
      p.vy *= Math.exp(-1.4 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    fwCtx.globalAlpha = alpha;
    fwCtx.fillStyle = p.color;
    fwCtx.beginPath();
    fwCtx.arc(p.x, p.y, p.size * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
    fwCtx.fill();
    next.push(p);
  }
  fwCtx.globalAlpha = 1;
  sparks = next;
}

function restartFromEasterEgg() {
  if (!openingRoll?.edgeStand) return;
  hideEasterEgg();
  if (openingRoll.rethrow()) {
    sound.dice(0.85);
  }
}

function show(id: 'title' | 'results' | null) {
  for (const s of ['title', 'results']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id !== null);
}

function nextSeed() {
  if (urlSeed !== null) { const seed = urlSeed; urlSeed = null; return seed; }
  return (Math.random() * 0x100000000) >>> 0;
}

function begin() {
  aiWorker?.terminate();
  aiWorker = null;
  hideEasterEgg();
  sound.start();
  if (controlChoice === 'pointer' && !bot) input.setMode('pointer');
  if (queued === 'online') {
    const ready = !!online.session && !!online.state?.ready[online.session.player];
    online.command({ type: ready ? 'unready' : 'ready' });
    return;
  }
  startGame(game, queued);
  game.phase = 'opening';
  humanSide = 0;
  scene.setPlayer(0);
  localClock = createClock();
  const seed = nextSeed();
  rollKey = `local:${seed}:${performance.now()}`;
  openingRoll = new DiceRoll(seed, !bot);
  sound.dice(0.8);
  grab.reset();
  latch.reset();
  roll.reset();
  primed = 'v';
  drag = null;
  pendingPawn = null;
  armAt = performance.now() + 500;
  show(null);
  paintMode();
}

function finishRoll(now: number) {
  if (!openingRoll?.done || openingRoll.first === null) return;
  if (game.mode !== 'online') {
    humanSide = openingRoll.first;
    scene.setPlayer(humanSide);
    game.turn = 0;
    game.phase = 'play';
    syncClock(localClock, game.turn, now);
  }
  armAt = now + 200;
  openingRoll = null;
}

function finish() {
  sound.win();
  const ai = game.mode === 'ai';
  const remote = game.mode === 'online';
  const you = game.winner === (remote ? online.player : humanSide);
  const who = remote ? (you ? 'You reached the far rank.' : 'Your friend reached the far rank.') : ai
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
  $('m-online').classList.toggle('on', queued === 'online');
  $('m-online').setAttribute('aria-pressed', String(queued === 'online'));
  $('title').classList.toggle('online-selected', queued === 'online');
  $('room-lobby').classList.toggle('hidden', queued !== 'online');
  $('ai-difficulty').classList.toggle('hidden', queued !== 'ai');
  roomUI.render();
}

function cancelCarry() {
  drag = null; grab.reset(); latch.reset(); roll.reset(); viewNeedsRelease = true;
}
function selectMode(mode: Mode) {
  if (mode === queued) return;
  aiWorker?.terminate();
  aiWorker = null;
  if (mode !== 'online') online.disconnect();
  controlRequest++;
  controlChoice = 'pointer';
  input.hands.tracker.stop();
  input.setMode('none');
  $('preview').classList.add('hidden');
  if (!cameraStarting) instructions.setCameraState('idle');
  queued = mode;
  humanSide = 0;
  scene.setPlayer(0);
  openingRoll = null;
  hideEasterEgg();
  rollKey = '';
  Object.assign(game, createGame(mode));
  pendingPawn = null;
  cancelCarry();
  show('title');
  paintMode();
}
const roomUI = setupRoomUI(online, () => { selectMode('ai'); }, () => ({ choice: controlChoice,
  ready: controlChoice === 'pointer' || input.mode === 'camera', busy: cameraStarting }));
let appliedSnapshot = online.state;
online.onChange = () => {
  const state = online.state;
  scene.setPlayer(online.player ?? 0);
  if (state && state !== appliedSnapshot) {
    appliedSnapshot = state;
    const previousPhase = game.phase, previousMoves = game.moves, previousFences = game.fences.length;
    Object.assign(game, structuredClone(state.game));
    remoteClock = { elapsed: [...state.clock.elapsed], running: state.clock.running, since: performance.now() };
    cancelCarry();
    if (game.phase !== 'title' && input.mode === 'none') input.setMode('pointer');
    if (game.phase === 'play' && previousPhase !== 'play') { sound.start(); armAt = performance.now() + 500; }
    if (state.opening && state.game.phase === 'play' && state.game.moves === 0) {
      const key = `${state.round}:${state.opening.seed}`;
      if (key !== rollKey) { rollKey = key; hideEasterEgg(); openingRoll = new DiceRoll(state.opening.seed, !bot); sound.dice(0.8); }
    } else if (state.game.phase !== 'play' || state.game.moves > 0) { openingRoll = null; hideEasterEgg(); }
    if (game.moves > previousMoves) sound.down(game.fences.length > previousFences ? 'fence' : 'pawn');
    if (game.phase === 'results' && previousPhase !== 'results') finish();
    else show(game.phase === 'title' ? 'title' : game.phase === 'results' ? 'results' : null);
  }
  if (!online.connected) syncClock(remoteClock, null, performance.now());
  if (!online.canPlay) cancelCarry();
  roomUI.render();
};
$('m-ai').addEventListener('click', () => { selectMode('ai'); });
$('m-hot').addEventListener('click', () => { selectMode('hotseat'); });
$('m-online').addEventListener('click', () => { selectMode('online'); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-level]')) {
  button.addEventListener('click', () => {
    difficulty = button.dataset.level as keyof typeof simulations;
    for (const option of document.querySelectorAll<HTMLButtonElement>('[data-level]')) {
      const selected = option === button;
      option.classList.toggle('on', selected);
      option.setAttribute('aria-pressed', String(selected));
    }
  });
}
paintMode();

$('b-cam').addEventListener('click', async () => {
  if (queued === 'online' && !online.connected) return;
  if (cameraStarting) return;
  if (controlChoice === 'camera' && input.mode === 'camera') return;
  const request = ++controlRequest;
  controlChoice = 'camera';
  cameraStarting = true;
  sound.start();
  instructions.setCameraState('starting');
  try {
    await input.startCamera();
    if (request !== controlRequest) {
      input.hands.tracker.stop(); input.setMode(game.phase === 'play' ? 'pointer' : 'none'); return;
    }
    $('preview').classList.remove('hidden');
  } catch {
    if (request === controlRequest) instructions.setCameraState('error');
  } finally {
    cameraStarting = false;
    if (request !== controlRequest || input.mode === 'camera') instructions.setCameraState('idle');
    roomUI.render();
  }
});
$('b-mouse').addEventListener('click', () => {
  if (cameraStarting) return;
  controlRequest++;
  controlChoice = 'pointer';
  input.hands.tracker.stop();
  input.setMode('pointer');
  $('preview').classList.add('hidden');
  instructions.setCameraState('idle');
});
$('b-start').addEventListener('click', () => { if (!$<HTMLButtonElement>('b-start').disabled) begin(); });
function toggleView() {
  if (game.phase !== 'play' && game.phase !== 'opening') return;
  // A new projection must not drop or re-grab the piece under a still-closed hand.
  drag = null;
  grab.reset();
  latch.reset();
  viewNeedsRelease = true;
  scene.view = scene.view === 'angled' ? 'top' : 'angled';
  scene.resize();
}
$('b-view').addEventListener('click', toggleView);
$('b-easter-restart').addEventListener('click', restartFromEasterEgg);
$('easter-egg').addEventListener('click', restartFromEasterEgg);
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
  if (e.code === 'Space' && openingRoll?.edgeStand && !(e.target instanceof Element && e.target.closest('button'))) {
    e.preventDefault();
    restartFromEasterEgg();
    return;
  }
  if (e.code === 'Space' && game.phase !== 'play' && !(e.target instanceof Element && e.target.closest('button'))) {
    if (game.mode === 'online' && game.phase === 'results') return;
    if (game.phase === 'title' && $<HTMLButtonElement>('b-start').disabled) return;
    e.preventDefault();
    if (input.mode === 'none') input.setMode('pointer');
    begin();
  }
  if (e.key === 'm' || e.key === 'M') sound.setMuted(!sound.muted);
  if (e.code === 'KeyV' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleView();
});
addEventListener('resize', () => scene.resize());

if (bot) input.setMode('bot');
if (bot || flag('autostart')) { if (input.mode === 'none') input.setMode('pointer'); begin(); }
else show('title');
if (q.has('room') && !bot && !flag('autostart')) {
  selectMode('online');
  $<HTMLInputElement>('room-code').value = q.get('room') ?? '';
  void online.open(q.get('room') ?? '');
}

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
    }, scene.aspect, humanSide);
  }
  input.update(dt);
  if (openingRoll && !openingRoll.done) {
    const hitStrength = openingRoll.step(reduceMotion && !openingRoll.settled ? 2.5 : dt);
    if (hitStrength > 0.45 && now - diceSoundAt > 90) { sound.dice(hitStrength); diceSoundAt = now; }
    if (openingRoll.done) finishRoll(now);
  }
  updateFireworks(dt, now);
  const rolling = !!openingRoll && !openingRoll.done;
  const h = input.hand;
  if (!h?.pinching) viewNeedsRelease = false;
  const point = h ? scene.boardPoint(h.screen.x, h.screen.y, !drag) : null;
  const hit = point ? scene.classify(point.x, point.z, game.pawns, !drag) : null;
  const human = !rolling && game.phase === 'play' && (game.mode === 'online' ? online.canPlay : game.mode === 'hotseat' || game.turn === humanSide);
  const autoFence = input.mode === 'camera' || input.mode === 'pointer';
  const useRoll = input.mode === 'bot';

  if (input.consumeRotate()) {
    if (drag?.kind === 'fence') { drag.o = toggled(drag.o); drag.manual = true; }
    else primed = toggled(primed);
  }
  // Manual turns lock this carry. Only the synthetic bot uses roll; human input aims along a gap.
  if (drag?.kind === 'fence' && useRoll && h?.pinching && !drag.manual) {
    drag.o = roll.update(h.roll);
  }

  const armed = now >= armAt;
  const canGrab = armed && !viewNeedsRelease && human && hit && (hit.pawn === game.turn || (hit.stock === game.turn && game.remaining[game.turn] > 0));
  const edge = grab.update(h && (drag || canGrab) ? h : null, input.mode === 'pointer' && h && !h.pinching ? RELEASE_HOLD_S : dt);
  if (armed && human && edge === 'grab' && hit && !drag) {
    if (hit.pawn === game.turn) {
      drag = { kind: 'pawn', o: 'v', x: hit.x, z: hit.z, legal: false, cell: null, slot: null, owner: game.turn, manual: false };
      sound.lift();
    } else if (hit.stock === game.turn && game.remaining[game.turn] > 0) {
      const o = useRoll ? roll.o : primed;
      drag = { kind: 'fence', o, x: hit.x, z: hit.z, legal: false, cell: null, slot: null, owner: game.turn, manual: !useRoll && !autoFence };
      sound.lift();
    }
  }
  // Freeze the destination throughout release grace; re-pinching resumes the carry.
  if (drag && h && (h.pinching || (input.mode === 'pointer' && edge === 'release'))) {
    if (hit) { drag.x = hit.x; drag.z = hit.z; }
    drag.cell = hit?.cell ?? null;
    drag.slot = hit?.slot ?? null;
    if (drag.kind === 'fence' && autoFence && hit?.slot && !drag.manual) {
      drag.o = fenceOrientation(hit.x, hit.z, hit.slot, drag.o);
    }
    if (drag.kind === 'fence' && drag.slot) Object.assign(drag, slotCenter(drag.slot.c, drag.slot.r));
    drag.legal = drag.kind === 'pawn'
      ? !!drag.cell && isLegalMove(game, drag.cell)
      : !!drag.slot && fenceProblem(game, { c: drag.slot.c, r: drag.slot.r, o: drag.o }) === null;
  }
  if (edge === 'release' && drag) {
    if (human && game.mode === 'online') {
      const aim = aimOf(drag.kind, drag);
      if (drag.legal && aim.kind !== 'none') {
        const action = drag.kind === 'pawn' ? { type: 'pawn' as const, c: aim.c, r: aim.r }
          : { type: 'fence' as const, c: aim.c, r: aim.r, o: drag.o };
        const carriedOwner = drag.owner;
        if (!online.command({ type: 'action', revision: online.state!.revision, action })) sound.no();
        else if (action.type === 'pawn') pendingPawn = { owner: carriedOwner, cell: { c: action.c, r: action.r } };
      } else sound.no();
    } else if (human) {
      const res = releaseDrag(game, drag.kind === 'pawn' ? { kind: 'pawn' } : { kind: 'fence', o: drag.o }, aimOf(drag.kind, drag));
      if (res.ok) {
        sound.down(drag.kind);
        if (game.winner !== null) finish();
      } else sound.no();
    }
    drag = null;
  } else if (edge === 'cancel' && drag) {
    drag = null;
    sound.no();
  }

  const aiSide = other(humanSide);
  const thinking = !rolling && game.mode === 'ai' && game.phase === 'play' && game.turn === aiSide && !drag;
  if (thinking && !aiWorker) {
    const snapshot = game.moves;
    const play = (action: ReturnType<typeof chooseAction>) => {
      if (game.phase !== 'play' || game.mode !== 'ai' || game.turn !== aiSide || game.moves !== snapshot) return;
      if (!action || !applyAction(game, action)) action = chooseAction(game);
      else {
        sound.down(action.type === 'pawn' ? 'pawn' : 'fence');
        if (game.winner !== null) finish();
        return;
      }
      if (action && applyAction(game, action)) {
        sound.down(action.type === 'pawn' ? 'pawn' : 'fence');
        if (game.winner !== null) finish();
      }
    };
    try {
      const worker = new Worker(new URL('./ai-worker.ts', import.meta.url), { type: 'module' });
      aiWorker = worker;
      worker.onmessage = (event) => { worker.terminate(); if (aiWorker === worker) { aiWorker = null; play(event.data); } };
      worker.onerror = () => { worker.terminate(); if (aiWorker === worker) { aiWorker = null; play(null); } };
      worker.postMessage({ game, simulations: simulations[difficulty] });
    } catch { aiWorker = null; play(null); }
  }

  const pinchEdge = latch.update(h?.pinching ? 1 : 0);
  if (pinchEdge === 'press' && openingRoll?.edgeStand && now - easterAt > 600) restartFromEasterEgg();
  else if (pinchEdge === 'press' && game.phase === 'results' && game.mode !== 'online' && now - resultsAt > 1500) begin();

  if (game.mode !== 'online' || !online.pending) pendingPawn = null;
  const renderPawns: [typeof game.pawns[0], typeof game.pawns[1]] = pendingPawn
    ? (pendingPawn.owner === 0 ? [pendingPawn.cell, game.pawns[1]] : [game.pawns[0], pendingPawn.cell])
    : game.pawns;
  const showLegal = human && drag?.kind !== 'fence';
  const legal = showLegal ? legalMoves(game, game.turn) : [];
  paintHud(thinking);
  scene.render({
    pawns: renderPawns,
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
    dice: rolling ? openingRoll!.poses() : null,
  });
  drawPreview();
}
requestAnimationFrame(frame);

function paintHud(thinking: boolean) {
  const ai = game.mode === 'ai';
  const remote = game.mode === 'online';
  $('name-0').textContent = remote ? (online.player === 0 ? 'You' : 'Friend') : ai ? (humanSide === 0 ? 'You' : 'Machine') : 'Player 1';
  $('name-1').textContent = remote ? (online.player === 1 ? 'You' : 'Friend') : ai ? (humanSide === 1 ? 'You' : 'Machine') : 'Player 2';
  const chinese = $('title').lang === 'zh-CN';
  $('color-0').textContent = chinese ? '月牙白' : 'Moon White';
  $('color-1').textContent = chinese ? '翡翠绿' : 'Jade Green';
  const clockNow = performance.now();
  const rolling = !!openingRoll && !openingRoll.done;
  if (!remote) syncClock(localClock, !rolling && game.phase === 'play' ? game.turn : null, clockNow);
  const elapsed = clockValues(remote ? remoteClock : localClock, clockNow);
  for (const player of [0, 1] as const) {
    const node = $<HTMLTimeElement>('time-' + player), value = formatTime(elapsed[player]);
    if (node.textContent !== value) { node.textContent = value; node.dateTime = `PT${Math.floor(elapsed[player] / 1000)}S`; }
  }
  $('fences-0').textContent = `${game.remaining[0]} fences`;
  $('fences-1').textContent = `${game.remaining[1]} fences`;
  const liveTurn = rolling ? (openingRoll!.settled ? openingRoll!.first : null) : game.phase === 'play' ? game.turn : null;
  $('side-0').classList.toggle('live', liveTurn === 0);
  $('side-1').classList.toggle('live', liveTurn === 1);
  const white = chinese ? '月牙白' : 'Moon White';
  const jade = chinese ? '翡翠绿' : 'Jade Green';
  let turn = thinking ? (chinese ? '电脑正在思考' : 'The machine is choosing') : ai
    ? (game.turn === humanSide ? (chinese ? '你的回合' : 'Your turn') : (chinese ? '电脑的回合' : "Machine's turn"))
    : game.turn === 0
      ? (chinese ? `${white}的回合` : `${white}'s turn`)
      : (chinese ? `${jade}的回合` : `${jade}'s turn`);
  if (remote) turn = !online.connected ? 'Connection lost · reconnecting' : !online.state?.connected.every(Boolean)
    ? 'Friend disconnected · waiting' : online.pending ? 'Confirming move…' : game.turn === online.player ? 'Your turn' : "Friend's turn";
  if (drag?.kind === 'pawn') turn = drag.legal ? (input.mode === 'camera' ? 'Separate your fingers on the green square' : 'Release on the green square') : 'That square is closed';
  if (drag?.kind === 'fence') turn = drag.legal ? (input.mode === 'camera' ? 'Separate your fingers to set the fence' : 'Release to place the fence') : 'That fence will not sit there';
  if (drag?.kind === 'fence' && input.mode === 'camera') {
    turn = !drag.slot ? 'Aim along a gap to turn the fence' : drag.legal
      ? `${drag.o === 'h' ? 'Horizontal' : 'Vertical'} · separate fingers to place`
      : 'That fence will not sit there';
  }
  const viewer = remote ? online.player : ai ? humanSide : null;
  if (rolling && (!remote || online.connected)) turn = openingCaption(openingRoll!, chinese, viewer);
  $('turn').textContent = turn;
  $('b-view').classList.toggle('hidden', game.phase !== 'play' && game.phase !== 'opening');
  $('b-view').textContent = scene.view === 'top' ? 'Angled view · V' : 'Top view · V';
  $('b-view').setAttribute('aria-pressed', String(scene.view === 'top'));
}

Object.defineProperty(window, '__game', {
  get: () => ({
    phase: game.phase,
    mode: game.mode,
    player: game.mode === 'online' ? online.player : humanSide,
    turn: game.turn,
    winner: game.winner,
    moves: game.moves,
    pawns: game.pawns.map((p) => ({ ...p })),
    remaining: [...game.remaining],
    fences: game.fences.length,
    holding: drag ? { kind: drag.kind, o: drag.o, legal: drag.legal } : null,
    input: input.mode,
    view: scene.view,
    hand: input.hand ? { x: input.hand.screen.x, y: input.hand.screen.y, pinch: input.hand.pinch, pinching: input.hand.pinching, roll: input.hand.roll } : null,
    fps: Math.round(fps),
    dpr: scene.renderer.getPixelRatio(),
    best,
    opening: openingRoll ? { seed: openingRoll.seed, settled: openingRoll.settled, edgeStand: openingRoll.edgeStand, first: openingRoll.first,
      attempts: openingRoll.attempts.map(attempt => ({ faces: [...attempt.faces], totals: [...attempt.totals] })) } : null,
    elapsed: clockValues(game.mode === 'online' ? remoteClock : localClock, performance.now()),
    room: online.session ? { code: online.session.code, player: online.player, connected: online.connected,
      revision: online.state?.revision, pending: online.pending, ready: online.state?.ready, round: online.state?.round } : null,
    cell: (c: number, r: number) => scene.cellToScreen(c, r),
    slot: (c: number, r: number) => scene.slotToScreen(c, r),
    stock: (p: 0 | 1) => scene.stockToScreen(p),
  }),
});
