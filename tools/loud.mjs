// Loudness while the bot plays: npm run loud [-- <url> <seconds>]
// Taps everything that reaches the AudioContext's output and prints median / p90 / p99 / peak in dBFS.
// Target used for the hands games: p90 between -27 and -31 dBFS, peaks no higher than -8. Nobody's ears were in
// the loop when those numbers were set, so listen too.
import { chromium } from 'playwright';

const [, , url = 'http://127.0.0.1:43123/?bot=1', secs = '30'] = process.argv;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  const taps = [];
  window.__loud = { rms: [], peak: 0 };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    if (target instanceof AudioDestinationNode) {
      const ctx = target.context;
      let tap = taps.find((t) => t.ctx === ctx);
      if (!tap) {
        const an = ctx.createAnalyser(); an.fftSize = 4096;
        const g = ctx.createGain();
        connect.call(g, target); connect.call(g, an);
        tap = { ctx, g, an, buf: new Float32Array(an.fftSize) };
        taps.push(tap);
      }
      return connect.call(this, tap.g, ...rest.slice(1));
    }
    return connect.call(this, target, ...rest);
  };
  setInterval(() => {
    let sum = 0, n = 0, pk = 0;
    for (const t of taps) { t.an.getFloatTimeDomainData(t.buf); for (const v of t.buf) { sum += v * v; n++; pk = Math.max(pk, Math.abs(v)); } }
    if (n) { window.__loud.rms.push(Math.sqrt(sum / n)); window.__loud.peak = Math.max(window.__loud.peak, pk); }
  }, 100);
});
await page.goto(url);
await page.waitForTimeout(Number(secs) * 1000);
const r = await page.evaluate(() => {
  const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
  const live = window.__loud.rms.filter((x) => db(x) > -60).sort((a, b) => a - b);
  const q = (p) => (live.length ? +db(live[Math.floor(live.length * p)]).toFixed(1) : null);
  return { audible: live.length, medianDb: q(0.5), p90Db: q(0.9), p99Db: q(0.99), peakDb: +db(window.__loud.peak).toFixed(1) };
});
console.log(JSON.stringify(r));
await browser.close();
