// Real HTTP + WebSocket regression against Wrangler (no browser or camera required).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.ROOMS_URL || 'http://[::1]:8787';
const checks = [], sockets = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
async function post(path, body = {}, headers = {}) {
  const response = await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  return { status: response.status, data: await response.json() };
}
class Client {
  constructor(code, seat) {
    this.state = null;
    this.listeners = new Set();
    this.ws = new WebSocket(origin.replace(/^http/, 'ws') + `/api/rooms/${code}/socket`, ['quoridor', 'seat.' + seat.token]);
    sockets.push(this.ws);
    this.ws.addEventListener('message', event => {
      if (event.data === 'pong') { for (const listener of this.listeners) listener({ type: 'pong' }); return; }
      const message = JSON.parse(event.data);
      if (message.type === 'state') this.state = message.snapshot;
      for (const listener of this.listeners) listener(message);
    });
  }
  wait(predicate, inspectCurrent = false) {
    if (inspectCurrent && this.state && predicate({ type: 'state', snapshot: this.state })) return Promise.resolve({ type: 'state', snapshot: this.state });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error('Timed out waiting for room event')); }, 8000);
      const listener = value => { if (predicate(value)) { clearTimeout(timer); this.listeners.delete(listener); resolve(value); } };
      this.listeners.add(listener);
    });
  }
  stateWhen(predicate) { return this.wait(m => m.type === 'state' && predicate(m.snapshot), true); }
  request(command) {
    const id = crypto.randomUUID();
    const response = this.wait(m => m.ack === id);
    this.ws.send(JSON.stringify({ ...command, id }));
    return response;
  }
  action(action, revision = this.state.revision) { return this.request({ type: 'action', revision, action }); }
}

try {
  const badOrigin = await post('/api/rooms', {}, { Origin: 'https://untrusted.example' });
  check('rejects cross-origin room creation', badOrigin.status === 403);
  const pagesOrigin = 'https://aurvallab.github.io';
  const preflight = await fetch(origin + '/api/rooms', { method: 'OPTIONS', headers: { Origin: pagesOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  check('allows GitHub Pages preflight', preflight.status === 204 && preflight.headers.get('Access-Control-Allow-Origin') === pagesOrigin && preflight.headers.get('Access-Control-Allow-Headers') === 'Content-Type');
  const pages = await fetch(origin + '/api/rooms', { method: 'POST', headers: { Origin: pagesOrigin, 'Content-Type': 'application/json' }, body: '{}' });
  check('allows GitHub Pages room creation', pages.status === 200 && pages.headers.get('Access-Control-Allow-Origin') === pagesOrigin);
  const malformed = await post('/api/rooms', []);
  check('rejects malformed JSON shape', malformed.status === 400);
  check('rejects oversized room requests', (await post('/api/rooms', { padding: 'x'.repeat(2100) })).status === 400);
  const streamed = await fetch(origin + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ padding: 'x'.repeat(2100) }))); controller.close(); } }),
    signal: AbortSignal.timeout(8000) });
  check('rejects oversized streaming input without Content-Length', streamed.status === 400);
  const host = await post('/api/rooms');
  check('creates six-character room and host seat', host.status === 200 && /^[A-HJ-NP-Z2-9]{6}$/.test(host.data.code) && host.data.player === 0);
  const code = host.data.code, path = `/api/rooms/${code}/join`;
  check('invalid resume token cannot take the empty guest seat', (await post(path, { token: 'forged' })).status === 403);
  const guest = await post(path);
  check('guest claims second seat', guest.status === 200 && guest.data.player === 1);
  check('third player refused', (await post(path)).status === 409);
  const forged = new WebSocket(origin.replace(/^http/, 'ws') + `/api/rooms/${code}/socket`, ['quoridor', 'seat.forged']);
  const refused = await new Promise(resolve => { forged.addEventListener('open', () => { forged.close(); resolve(false); }); forged.addEventListener('error', () => resolve(true)); });
  check('unauthenticated WebSocket refused', refused);
  const a = new Client(code, host.data); await a.stateWhen(s => s.connected[0]);
  const b = new Client(code, guest.data); await b.stateWhen(s => s.connected.every(Boolean)); await a.stateWhen(s => s.connected.every(Boolean));
  check('snapshot contains no seat credentials', !JSON.stringify(a.state).includes(host.data.token) && !JSON.stringify(a.state).includes(guest.data.token));
  const pong = a.wait(m => m.type === 'pong'); a.ws.send('ping'); await pong;
  check('hibernation-compatible heartbeat works', true);
  await a.request({ type: 'ready' });
  check('one ready player does not start round', a.state.game.phase === 'title');
  await b.request({ type: 'ready' }); await a.stateWhen(s => s.game.phase === 'play');
  check('both ready starts the same round', a.state.game.phase === b.state.game.phase && a.state.round === 1);
  check('both seats receive the same authoritative running clock', a.state.clock.running === 0 && JSON.stringify(a.state.clock) === JSON.stringify(b.state.clock));
  check('guest cannot act on host turn', (await b.action({ type: 'pawn', c: 4, r: 7 })).code === 'not-your-turn');
  check('server enforces legal movement', (await a.action({ type: 'pawn', c: 4, r: 8 })).code === 'illegal');
  const revision = a.state.revision;
  const parallel = await Promise.all([a.action({ type: 'pawn', c: 4, r: 1 }, revision), a.action({ type: 'pawn', c: 4, r: 1 }, revision)]);
  await b.stateWhen(s => s.game.moves === 1);
  check('concurrent duplicate commits change board exactly once', parallel.filter(m => m.type === 'state').length === 1 && b.state.game.moves === 1);
  check('committing a move switches the running clock', b.state.clock.running === 1 && b.state.clock.elapsed[0] >= 0 && b.state.clock.elapsed[1] >= 0);
  await b.action({ type: 'fence', c: 0, r: 0, o: 'h' }); await a.stateWhen(s => s.game.moves === 2);
  check('guest fence owner and inventory synchronize', a.state.game.fences[0].owner === 1 && a.state.game.remaining[1] === 9);
  check('old board revision rejected', (await a.action({ type: 'pawn', c: 4, r: 2 }, revision)).code === 'stale');
  await a.action({ type: 'pawn', c: 4, r: 2 }); await b.stateWhen(s => s.game.moves === 3);
  await b.action({ type: 'pawn', c: 4, r: 7 }); await a.stateWhen(s => s.game.moves === 4);
  b.ws.close(); await a.stateWhen(s => !s.connected[1]);
  check('opponent disconnect pauses commits', (await a.action({ type: 'pawn', c: 4, r: 3 })).code === 'opponent-offline');
  const resumed = await post(path, { token: guest.data.token });
  check('refresh resume retains guest seat and existing board', resumed.data.player === 1 && resumed.data.snapshot.game.moves === 4);
  check('offline clock is paused and restored without charging disconnected time', a.state.clock.running === null && JSON.stringify(a.state.clock) === JSON.stringify(resumed.data.snapshot.clock));
  const c = new Client(code, resumed.data); await c.stateWhen(s => s.connected.every(Boolean)); await a.stateWhen(s => s.connected.every(Boolean));
  const replaced = new Promise(resolve => c.ws.addEventListener('close', event => resolve(event.code)));
  const d = new Client(code, resumed.data); await d.stateWhen(s => s.connected.every(Boolean));
  check('new connection replaces same seat without a reconnect fight', await replaced === 4001);
  const moves = [
    [a, 4, 3], [d, 3, 7], [a, 4, 4], [d, 3, 6], [a, 4, 5], [d, 3, 5],
    [a, 4, 6], [d, 3, 4], [a, 4, 7], [d, 3, 3], [a, 4, 8],
  ];
  for (const [client, col, row] of moves) {
    await client.stateWhen(s => s.game.turn === (client === a ? 0 : 1));
    const result = await client.action({ type: 'pawn', c: col, r: row });
    assert.equal(result.type, 'state', `legal scripted move ${col},${row}`);
  }
  await d.stateWhen(s => s.game.phase === 'results');
  check('victory synchronized for both players', a.state.game.winner === 0 && d.state.game.winner === 0);
  await a.request({ type: 'rematch' });
  check('one rematch vote does not reset board', a.state.game.phase === 'results');
  await d.request({ type: 'rematch' }); await a.stateWhen(s => s.round === 2);
  check('both rematch votes reset round and inventories', a.state.game.moves === 0 && a.state.game.remaining.every(n => n === 10) && d.state.round === 2);
  check('mutual rematch resets both clocks', a.state.clock.running === 0 && a.state.clock.elapsed[0] < 500 && a.state.clock.elapsed[1] === 0);
  check('previous-round action remains stale', (await a.action({ type: 'pawn', c: 4, r: 1 }, revision)).code === 'stale');
  const switchHost = await post('/api/rooms'), switchCode = switchHost.data.code;
  const e = new Client(switchCode, switchHost.data); await e.stateWhen(s => s.connected[0]);
  await e.request({ type: 'swap', revision: e.state.revision });
  check('host can choose Jade before guest joins', e.state.sides[0] === 1 && e.state.sides[1] === 0);
  const switchGuest = await post(`/api/rooms/${switchCode}/join`);
  const f = new Client(switchCode, switchGuest.data); await f.stateWhen(s => s.connected.every(Boolean)); await e.stateWhen(s => s.connected.every(Boolean));
  check('new guest gets the remaining color', f.state.sides[1] === 0);
  await e.request({ type: 'ready' });
  check('ready player locks side switching', (await f.request({ type: 'swap', revision: f.state.revision })).code === 'side-locked');
  await e.request({ type: 'unready' });
  check('ready can be cancelled without starting round', e.state.game.phase === 'title' && !e.state.ready.some(Boolean));
  await e.request({ type: 'ready' }); await f.request({ type: 'ready' }); await e.stateWhen(s => s.game.phase === 'play');
  check('Jade host cannot move Moon White pawn', (await e.action({ type: 'pawn', c: 4, r: 1 })).code === 'not-your-turn');
  check('Moon White guest moves first', (await f.action({ type: 'pawn', c: 4, r: 1 })).type === 'state');
  await e.stateWhen(s => s.game.moves === 1);
  check('Jade host moves its own pawn after the guest', (await e.action({ type: 'pawn', c: 4, r: 7 })).type === 'state');
  check('color survives credential resume', (await post(`/api/rooms/${switchCode}/join`, { token: switchHost.data.token })).data.snapshot.sides[0] === 1);
  check('production static output serves', (await fetch(origin)).ok);
  const wasm = await fetch(origin + '/wasm/vision_wasm_internal.wasm', { method: 'HEAD' });
  check('self-hosted camera WASM serves with proper MIME', wasm.ok && wasm.headers.get('content-type')?.includes('application/wasm'));
  await mkdir('outputs/online', { recursive: true });
  await writeFile('outputs/online/service-checks.json', JSON.stringify({ origin, checks, passed: checks.length }, null, 2));
  console.log(`${checks.length} room service checks passed at ${origin}`);
} catch (error) { console.error('Last completed check:', checks.at(-1)); throw error; }
finally { for (const ws of sockets) ws.close(); }
