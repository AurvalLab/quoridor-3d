import { DurableObject } from 'cloudflare:workers';
import { advanceRoom, createRoom, joinRoom, parseCommand, ROOM_CODE, roomCommand, seatFor, snapshot, syncRoomClock,
  type RoomData, type RoomMessage } from '../src/room';
import type { Player } from '../src/rules';
import { createClock } from '../src/clock';

interface Env { ROOMS: DurableObjectNamespace<GameRoom>; ASSETS: Fetcher }
interface Connection { player: Player; window: number; count: number }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (error: string, status = 400) => json({ error }, status);
const pagesOrigin = 'https://aurvallab.github.io';

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  if (Number(request.headers.get('Content-Length')) > 2048) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 2048) { await reader.cancel(); return null; }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }
  catch { return null; }
}

async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && origin !== pagesOrigin) return fail('origin', 403);
    if (origin === pagesOrigin && request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (!await body(request)) return fail('message');
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), v => alphabet[v % alphabet.length]).join('');
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const result = await room.fetch(new Request(new URL('/create', url), { method: 'POST' }));
        if (result.status === 409) continue;
        return json({ ...await result.json() as object, code }, result.status);
      }
      return fail('busy', 503);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/(join|socket)$/);
    if (!match || !ROOM_CODE.test(match[1])) return fail('not-found', 404);
    if (match[2] === 'join' && request.method !== 'POST') return fail('method', 405);
    if (match[2] === 'socket' && (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')) return fail('upgrade', 426);
    url.pathname = '/' + match[2];
    if (match[2] === 'join') {
      // Buffer bounded input before entering the room lock; a slow upload must not pause a game.
      const data = await body(request);
      if (!data) return fail('message');
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(new Request(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }));
    }
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(new Request(url, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await route(request, env);
    if (request.headers.get('Origin') !== pagesOrigin || response.status === 101) return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', pagesOrigin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;

export class GameRoom extends DurableObject<Env> {
  private room: RoomData | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomData>('room') ?? null;
      if (this.room) {
        this.room.sides ??= [0, 1];
        this.room.clock ??= createClock();
        this.room.opening ??= null;
        // With no restored sockets, resume from the saved clock instead of charging server downtime.
        if (!this.connected().every(Boolean)) this.room.clock.running = null;
      }
    });
  }

  private connected(): [boolean, boolean] {
    return [this.ctx.getWebSockets('seat0').some(ws => ws.readyState === WebSocket.OPEN),
      this.ctx.getWebSockets('seat1').some(ws => ws.readyState === WebSocket.OPEN)];
  }
  private send(ws: WebSocket, message: RoomMessage) {
    try { ws.send(JSON.stringify(message)); } catch { /* closed while broadcasting */ }
  }
  private broadcast(sender?: WebSocket, ack?: string) {
    if (!this.room) return;
    const state = snapshot(this.room, this.connected());
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { type: 'state', snapshot: state, ...(ws === sender && ack ? { ack } : {}) });
    }
  }
  private async persist() { await this.ctx.storage.put('room', this.room); }

  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const path = new URL(request.url).pathname;
      if (path === '/create') {
        if (this.room) return fail('exists', 409);
        const token = crypto.randomUUID();
        this.room = createRoom(token);
        await this.persist();
        return json({ player: 0, token, snapshot: snapshot(this.room, this.connected()) });
      }
      if (!this.room) return fail('not-found', 404);
      if (path === '/join') {
        const data = await body(request);
        if (!data || (data.token !== undefined && (typeof data.token !== 'string' || data.token.length > 64))) return fail('message');
        const seat = joinRoom(this.room, data.token as string | undefined, crypto.randomUUID());
        if (typeof seat === 'string') return fail(seat, seat === 'full' ? 409 : 403);
        await this.persist();
        this.broadcast();
        return json({ ...seat, snapshot: snapshot(this.room, this.connected()) });
      }
      if (path !== '/socket') return fail('not-found', 404);
      const protocols = request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(v => v.trim()) ?? [];
      const token = protocols.find(v => v.startsWith('seat.'))?.slice(5) ?? '';
      const player = seatFor(this.room, token);
      if (!protocols.includes('quoridor') || player === null) return fail('credentials', 403);
      const old = this.ctx.getWebSockets('seat' + player);
      // One live tab per seat; superseded tabs stop retrying instead of fighting for ownership.
      for (const ws of old) ws.close(4001, 'Seat opened in another tab');
      const pair = new WebSocketPair();
      pair[1].serializeAttachment({ player, window: Date.now(), count: 0 } satisfies Connection);
      this.ctx.acceptWebSocket(pair[1], ['seat' + player]);
      const started = advanceRoom(this.room, this.connected());
      if (syncRoomClock(this.room, this.connected()) || started) { this.room.revision++; await this.persist(); }
      this.broadcast();
      return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': 'quoridor' } });
    });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.room || ws.readyState !== WebSocket.OPEN) return;
      if (typeof data !== 'string' || data.length > 2048) { ws.close(1009, 'Message too large'); return; }
      const connection = ws.deserializeAttachment() as Connection;
      if (Date.now() - connection.window >= 10_000) { connection.window = Date.now(); connection.count = 0; }
      connection.count++;
      ws.serializeAttachment(connection);
      if (connection.count > 30) { ws.close(4008, 'Too many messages'); return; }
      let value: unknown;
      try { value = JSON.parse(data); } catch { this.send(ws, { type: 'error', code: 'message' }); return; }
      const command = parseCommand(value);
      if (!command) { this.send(ws, { type: 'error', code: 'message' }); return; }
      const previous = structuredClone(this.room);
      let error = roomCommand(this.room, connection.player, command, this.connected());
      if (!error) {
        try { await this.persist(); }
        catch { this.room = previous; error = 'unavailable'; }
      }
      if (error) {
        this.send(ws, { type: 'error', code: error, ack: command.id });
        this.send(ws, { type: 'state', snapshot: snapshot(this.room, this.connected()) });
        return;
      }
      this.broadcast(ws, command.id);
    });
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    void wasClean;
    // Browsers may report reserved 1005/1006 codes, which cannot be sent in a close frame.
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* already closed */ }
    await this.presenceChanged();
  }
  async webSocketError(ws: WebSocket) { ws.close(1011, 'Connection error'); await this.presenceChanged(); }
  private async presenceChanged() {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.room && syncRoomClock(this.room, this.connected())) { this.room.revision++; await this.persist(); }
      this.broadcast();
    });
  }
}
