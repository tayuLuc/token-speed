/**
 * probe.js — browser-side measurement harness.
 *
 * It exists to answer one question with numbers instead of adjectives: does the
 * stream actually emit the number of tokens per second the slider promises?
 * The same script is what tools/verify.mjs runs in a real browser before deploy.
 *
 * Usage from the page console / agent-browser eval:
 *   import('/tools/probe.js').then(m => m.run())   // starts, stores on window.__tsTest
 *   window.__tsTest                               // read the result
 */

import { Stream } from '../assets/player.js';
import { CORPUS } from '../assets/corpus.js';

function measure(chunks, tps, { ttftMs = 0, jitter = 0, stall = 0 } = {}) {
  return new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const s = new Stream({
      chunks, tps, ttftMs, jitter, stall,
      onToken: () => { n++; },
      onState: (st, reason) => {
        if (reason !== 'done') return;
        const wall = (performance.now() - t0) / 1000;
        resolve({
          target: tps,
          emitted: n,
          total: chunks.length,
          wallSec: +wall.toFixed(3),
          achieved: +st.achievedTps.toFixed(2),
          errorPct: +(((st.achievedTps - tps) / tps) * 100).toFixed(2),
          ttftMs: Math.round(st.ttftMs),
        });
      },
    });
    s.start();
  });
}

/** What the obvious implementation — setInterval(1000 / tps) — really achieves. */
function measureNaiveInterval(tps, ms = 2000) {
  return new Promise((resolve) => {
    let c = 0;
    const iv = setInterval(() => { c++; }, 1000 / tps);
    setTimeout(() => { clearInterval(iv); resolve(+(c / (ms / 1000)).toFixed(2)); }, ms);
  });
}

export async function run() {
  const all = CORPUS.find((c) => c.id === 'mech').tokens;
  // Sample long enough that the measurement window is at least ~1.5 s at every
  // rate: a 0.4 s window at 150 tok/s is 60 samples and swings by ±10 % on
  // jitter alone, which would make the table noise instead of measurement.
  const sliceFor = (tps) => Math.min(all.length, Math.max(60, Math.ceil(tps * 1.6)));
  const out = { runs: [], naive: {}, jittered: {} };

  for (const tps of [10, 25, 150, 250]) {
    const n = sliceFor(tps);
    out.runs.push(await measure(all.slice(0, n), tps));
  }
  for (const tps of [25, 200]) out.naive[tps] = await measureNaiveInterval(tps);
  for (const tps of [25, 120]) {
    const n = sliceFor(tps);
    out.jittered[tps] = await measure(all.slice(0, n), tps, { jitter: 0.3, stall: 0.06 });
  }
  out.ttft = await measure(all.slice(0, 64), 40, { ttftMs: 500 });

  out.pass = out.runs.every((r) => Math.abs(r.errorPct) < 8)
    && out.ttft.ttftMs >= 480
    && out.jittered[25].errorPct > -10
    && out.jittered[120].errorPct < 10;
  out.done = true;
  window.__tsTest = out;
  return out;
}