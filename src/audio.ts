/**
 * Procedural wood, no audio files. A pawn step is a short knock; a fence is a higher, crisper clack.
 * A refused placement is a dull tick so the hand learns the red preview. One quiet pad keeps the
 * room from going silent between moves. Everything sits behind one master gain and a compressor.
 */
export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  muted = false;

  /** Call from the click or key that starts the game. Safe to call again. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const ctx = this.ctx;
    this.master = new GainNode(ctx, { gain: this.muted ? 0 : 1.05 });
    this.master.connect(new DynamicsCompressorNode(ctx, { threshold: -16, ratio: 4, knee: 8 })).connect(ctx.destination);
    this.verb = new ConvolverNode(ctx, { buffer: this.impulse(1.4) });
    this.verb.connect(new GainNode(ctx, { gain: 0.22 })).connect(this.master);
    this.room();
  }

  private impulse(secs: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  private room() {
    const ctx = this.ctx!;
    const pad = new GainNode(ctx, { gain: 0 });
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.5 });
    pad.connect(lp).connect(this.master);
    for (const [f, d] of [[98, -3], [98, 4], [147, 1]]) {
      const o = new OscillatorNode(ctx, { type: 'triangle', frequency: f, detune: d });
      o.connect(new GainNode(ctx, { gain: 0.035 })).connect(pad);
      o.start();
    }
    pad.gain.setTargetAtTime(0.35, ctx.currentTime, 1.8);
  }

  /** Noise burst plus a body tone. `bright` is the click of wood on wood. */
  private knock(freq: number, dur: number, gain: number, bright: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: bright, Q: bright > 2000 ? 4.5 : 1.6 });
    const body = new OscillatorNode(ctx, { type: 'sine', frequency: freq });
    const tick = new OscillatorNode(ctx, { type: 'triangle', frequency: bright });
    const g = new GainNode(ctx, { gain: 0 });
    src.connect(bp).connect(g);
    body.connect(new GainNode(ctx, { gain: 0.55 })).connect(g);
    tick.connect(new GainNode(ctx, { gain: 0.12 })).connect(g);
    g.connect(this.master);
    g.connect(this.verb);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.start(t); src.stop(t + dur);
    body.start(t); body.stop(t + dur);
    tick.start(t); tick.stop(t + Math.min(0.035, dur));
  }

  lift() { this.knock(150, 0.05, 0.07, 900); }

  down(kind: 'pawn' | 'fence') {
    if (kind === 'fence') this.knock(340, 0.16, 0.34, 4200);
    else this.knock(190, 0.09, 0.24, 2100);
  }

  /** A dull tick: the placement was refused. */
  no() { this.knock(96, 0.11, 0.07, 320); }

  win() {
    this.knock(220, 0.22, 0.16, 1400);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.08;
    const o = new OscillatorNode(ctx, { type: 'sine', frequency: 330 });
    const g = new GainNode(ctx, { gain: 0 });
    o.connect(g); g.connect(this.master); g.connect(this.verb);
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
    o.start(t); o.stop(t + 1.15);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1.05, this.ctx.currentTime, 0.05);
  }
}
