/**
 * player.js — the streaming engine.
 *
 * Design note (this is the whole point of the project):
 *
 * The obvious implementation is `setInterval(1000 / tps)`, and it lies. Measured
 * in Chromium 154 on the machine this repo was built on: a 5 ms interval
 * (200 tok/s) whose callback costs 25 ms delivers 40.3 tokens/s — five times
 * slower than the number it was asked for, with a median gap of 25 ms instead of
 * 5 ms. A demo about speed that reports a speed it does not run at is worse
 * than no demo. (Full numbers: tools/measure-baseline.md.)
 *
 * Here the schedule is computed, not timed: at every tick we ask "how many
 * tokens should have been emitted by now?" and emit the difference. A late frame
 * produces a catch-up burst, so the average rate over the run is the requested
 * rate — and the UI can show achieved-vs-target instead of pretending.
 *
 * Jitter is a separate, optional layer: inter-token gaps are sampled around
 * 1/tps with a log-normal-ish spread plus occasional stalls, which is what
 * token-batching providers actually look like. The mean is preserved, so
 * "realistic" mode does not quietly slow everything down.
 */

const MAX_EMIT_PER_TICK = 400;

/** Gaussian via Box-Muller, clamped so a freak sample cannot freeze a lane. */
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function jitterFactor(sigma) {
  // exp(N(0, sigma)) has mean exp(sigma^2/2); divide it back out so the
  // expected interval stays 1/tps.
  return Math.exp(gauss() * sigma - (sigma * sigma) / 2);
}

export class Stream {
  /**
   * @param {object} opts
   * @param {string[]} opts.chunks  token-like chunks to emit
   * @param {number} opts.tps       target tokens per second after the first token
   * @param {number} opts.ttftMs    wait before the first token
   * @param {number} opts.jitter    0 = metronome, 0.35 = visibly realistic
   * @param {number} opts.stall     probability of an extra hiccup per token
   */
  constructor(opts) {
    this.chunks = opts.chunks;
    this.tps = Math.max(0.01, opts.tps);
    this.ttftMs = Math.max(0, opts.ttftMs || 0);
    this.jitter = opts.jitter ?? 0.3;
    this.stall = opts.stall ?? 0.06;

    this.onToken = opts.onToken || (() => {});
    this.onState = opts.onState || (() => {});

    this.running = false;
    this.done = false;
    this.index = 0;
    this.startedAt = 0;
    this.firstTokenAt = 0;
    this.endedAt = 0;
    this._lastTick = 0;
    this._simTime = 0; // simulated seconds since the first token is due
    this._nextDue = 0; // simulated time of the next token
    this._raf = null;
    this._heartbeat = null;
  }

  /** Tokens that should have been emitted by wall-clock `now`. */
  start() {
    if (this.running) return;
    this.running = true;
    this.done = false;
    this.startedAt = performance.now();
    this._lastTick = this.startedAt;
    this._nextDue = 0;
    this._simTime = 0;
    const loop = (now) => {
      if (!this.running) return;
      this.tick(now);
      if (this.running) this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    // A second, independent clock: rAF stops in a background tab, and a speed
    // demo that freezes when you switch tabs is a demo that stops teaching.
    this._heartbeat = setInterval(() => this.tick(performance.now()), 200);
    this.onState(this.stats());
  }

  stop(reason = 'stopped') {
    if (!this.running) return this.stats();
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._heartbeat) clearInterval(this._heartbeat);
    this._raf = null;
    this._heartbeat = null;
    if (!this.endedAt) this.endedAt = performance.now();
    this.onState(this.stats(), reason);
    return this.stats();
  }

  /**
   * Inter-token gap for the next token.
   *
   * Jitter alone preserves the mean (exp(N(0,σ) − σ²/2) has mean 1). Stalls do
   * not: a stall adds `1 + U(0,2.5)` intervals with probability `stall`, so
   * leaving the base interval untouched would quietly make the whole stream
   * ~13 % slower at stall = 0.06 — a lie told by the "realistic" switch. The
   * expected stall cost is subtracted from the base first, so the mean gap stays
   * 1/tps whatever the jitter and stall settings are.
   */
  nextInterval() {
    const stallMean = this.stall * 1.25; // E[1 + U(0, 2.5)] = 2.25, minus the 1 already there
    const base = (1 / this.tps) * Math.max(0.2, 1 - stallMean);
    const jitterMul = jitterFactor(this.jitter);
    const stallMul = this.stall > 0 && Math.random() < this.stall ? 1 + Math.random() * 2.5 : 1;
    return Math.max(0.0005, base * jitterMul * stallMul);
  }

  tick(now) {
    if (!this.running) return;
    const dt = Math.min(1, (now - this._lastTick) / 1000);
    this._lastTick = now;

    const sinceStart = (now - this.startedAt) / 1000;
    if (sinceStart < this.ttftMs / 1000) {
      this.onState(this.stats());
      return;
    }

    // Simulated clock advances at wall-clock speed; the schedule inside it is
    // jittered, so the mean rate still equals tps.
    this._simTime += dt;

    let emitted = 0;
    while (this.index < this.chunks.length && this._nextDue <= this._simTime && emitted < MAX_EMIT_PER_TICK) {
      if (!this.firstTokenAt) this.firstTokenAt = now;
      this.onToken(this.chunks[this.index], this.index);
      this.index++;
      this._nextDue += this.nextInterval();
      emitted++;
    }

    if (this.index >= this.chunks.length) {
      this.endedAt = now;
      this.running = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._heartbeat) clearInterval(this._heartbeat);
      this._raf = null;
      this._heartbeat = null;
      this.onState(this.stats(), 'done');
      return;
    }
    this.onState(this.stats());
  }

  stats() {
    const now = this.running || !this.endedAt ? performance.now() : this.endedAt;
    const total = this.chunks.length;
    const elapsed = (now - this.startedAt) / 1000;
    const decodeFrom = this.firstTokenAt || 0;
    const decodeSec = decodeFrom ? (now - decodeFrom) / 1000 : 0;
    return {
      running: this.running,
      done: this.done || (!this.running && this.index >= total),
      startedAt: this.startedAt,
      endedAtMs: this.running || !this.endedAt ? now : this.endedAt,
      total,
      emitted: this.index,
      progress: total ? this.index / total : 0,
      elapsed,
      waitingFirst: !decodeFrom && this.running,
      ttftMs: decodeFrom ? decodeFrom - this.startedAt : 0,
      achievedTps: decodeSec > 0.005 ? (this.index - 1) / decodeSec : 0,
      etaSec: this.running && decodeSec > 0
        ? Math.max(0, (total - this.index - 1) / Math.max(this.tps, 0.01))
        : 0,
    };
  }
}

/**
 * Rolling series of ARRIVAL TIMESTAMPS (performance.now() values).
 *
 * Timestamps in, statistics out: gaps between consecutive arrivals are the
 * inter-token latencies, so callers must never push durations here — pushing
 * absolute times twice is exactly the mistake that turns ITL into 60 000 ms.
 */
export class Series {
  constructor(limit = 20000) {
    this.limit = limit;
    this.t = [];
  }
  push(ts) {
    this.t.push(ts);
    if (this.t.length > this.limit) this.t.shift();
  }
  reset() {
    this.t = [];
  }
  /** Inter-token gaps in ms. @returns {{n:number,mean:number,p50:number,p95:number,max:number,sd:number}} */
  gaps() {
    const a = this.t;
    if (a.length < 2) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0, sd: 0 };
    const g = new Array(a.length - 1);
    for (let i = 1; i < a.length; i++) g[i - 1] = a[i] - a[i - 1];
    return Series.describe(g);
  }
  /** @param {number[]} a any list of numbers */
  static describe(a) {
    if (!a.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0, sd: 0 };
    const s = [...a].sort((x, y) => x - y);
    const mean = a.reduce((p, c) => p + c, 0) / a.length;
    const sd = Math.sqrt(a.reduce((p, c) => p + (c - mean) ** 2, 0) / a.length);
    return {
      n: a.length,
      mean,
      p50: s[Math.floor(a.length * 0.5)],
      p95: s[Math.min(a.length - 1, Math.floor(a.length * 0.95))],
      max: s[a.length - 1],
      sd,
    };
  }
  /** Instantaneous arrival rate over the last `winMs` milliseconds. */
  rate(winMs = 1000) {
    const a = this.t;
    if (a.length < 2) return 0;
    const last = a[a.length - 1];
    let i = a.length - 1;
    while (i > 0 && last - a[i - 1] <= winMs) i--;
    const span = (last - a[i]) / 1000;
    return span > 0.005 ? (a.length - 1 - i) / span : 0;
  }
}