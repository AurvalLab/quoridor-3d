import type { Action } from './ai';
import type { Player } from './rules';
import { ROOM_CODE, type RoomError, type RoomMessage, type RoomSnapshot } from './room';

type ErrorCode = RoomError | 'network' | 'code' | 'replaced' | 'storage';
interface Session { code: string; player: Player; token: string }
type Intent = { type: 'ready' | 'unready' | 'rematch' } | { type: 'swap'; revision: number } | { type: 'action'; revision: number; action: Action };
const apiOrigin = location.origin === 'https://aurvallab.github.io' ? 'https://quoridor-3d.2911733707.workers.dev' : location.origin;

export class Online {
  session: Session | null = null;
  state: RoomSnapshot | null = null;
  connected = false;
  busy = false;
  pending = false;
  error: ErrorCode | null = null;
  onChange = () => {};
  private ws: WebSocket | null = null;
  private generation = 0;
  private retries = 0;
  private retryTimer = 0;
  private commandTimer = 0;
  private heartbeat = 0;
  private lastReceived = 0;
  private pendingId: string | null = null;

  constructor() {
    addEventListener('online', () => { if (this.session && !this.connected) { clearTimeout(this.retryTimer); this.connect(); } });
  }

  private emit() { this.onChange(); }
  async open(code?: string) {
    if (this.busy) return;
    code = code?.trim().toUpperCase();
    if (code !== undefined && !ROOM_CODE.test(code)) { this.error = 'code'; this.emit(); return; }
    this.disconnect(false);
    const generation = this.generation;
    this.busy = true; this.error = null; this.emit();
    let token: string | null = null;
    try { if (code) token = sessionStorage.getItem('quoridor.room.' + code); } catch { /* usable until reload */ }
    try {
      const response = await fetch(new URL(code ? `/api/rooms/${code}/join` : '/api/rooms', apiOrigin), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(token ? { token } : {}),
        signal: AbortSignal.timeout(12_000),
      });
      const data = await response.json();
      if (generation !== this.generation) return;
      if (!response.ok) { this.error = data.error ?? 'network'; return; }
      this.session = { code: code ?? data.code, player: data.player, token: data.token };
      this.state = data.snapshot;
      try { sessionStorage.setItem('quoridor.room.' + this.session.code, this.session.token); } catch { this.error = 'storage'; }
      const url = new URL(location.href); url.searchParams.set('room', this.session.code);
      history.replaceState(null, '', url);
      this.connect();
    } catch { if (generation === this.generation) this.error = 'network'; }
    finally { if (generation === this.generation) { this.busy = false; this.emit(); } }
  }

  private connect() {
    if (!this.session || this.ws) return;
    const url = new URL(`/api/rooms/${this.session.code}/socket`, apiOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(url, ['quoridor', 'seat.' + this.session.token]);
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.lastReceived = Date.now();
      this.heartbeat = window.setInterval(() => {
        if (Date.now() - this.lastReceived > 45_000) { ws.close(); return; }
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 20_000);
    };
    ws.onmessage = event => {
      if (ws !== this.ws) return;
      this.lastReceived = Date.now();
      if (event.data === 'pong') return;
      let message: RoomMessage;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.ack === this.pendingId) { this.pendingId = null; this.pending = false; clearTimeout(this.commandTimer); }
      if (message.type === 'state') {
        this.state = message.snapshot;
        this.connected = true;
        this.retries = 0;
        if (this.error === 'network') this.error = null;
      } else if (message.type === 'error') this.error = message.code;
      this.emit();
    };
    ws.onclose = event => {
      if (ws !== this.ws) return;
      this.ws = null; this.connected = false; this.pending = false; this.pendingId = null;
      clearInterval(this.heartbeat); clearTimeout(this.commandTimer);
      this.error = event.code === 4001 ? 'replaced' : 'network';
      this.emit();
      if (event.code !== 4001) this.retryTimer = window.setTimeout(() => this.connect(), Math.min(8000, 600 * 2 ** this.retries++));
    };
    ws.onerror = () => { /* close event performs reconnection */ };
  }

  command(intent: Intent): boolean {
    if (!this.connected || this.pending || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.pendingId = crypto.randomUUID(); this.pending = true; this.error = null;
    this.ws.send(JSON.stringify({ ...intent, id: this.pendingId }));
    this.commandTimer = window.setTimeout(() => this.ws?.close(), 8000);
    this.emit();
    return true;
  }
  get canPlay() {
    return this.connected && !this.pending && !!this.session && !!this.state && this.state.connected.every(Boolean)
      && this.state.game.phase === 'play' && this.state.game.turn === this.player;
  }
  get player(): Player | null { return this.session && this.state ? this.state.sides[this.session.player] : null; }
  disconnect(clearUrl = true) {
    this.generation++;
    clearTimeout(this.retryTimer); clearTimeout(this.commandTimer); clearInterval(this.heartbeat);
    const ws = this.ws; this.ws = null; ws?.close(1000, 'Leaving room');
    this.connected = false; this.busy = false; this.pending = false; this.pendingId = null;
    this.session = null; this.state = null; this.error = null; this.retries = 0;
    if (clearUrl) { const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url); }
  }
}
