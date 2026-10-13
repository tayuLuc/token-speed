#!/usr/bin/env bun
/**
 * verify.mjs — the check that runs before anything is called done.
 *
 * Drives a real Chromium over CDP with the HTTP cache DISABLED (a reloaded ES
 * module otherwise hides the edit you are testing) and checks four things that
 * have each actually broken at least once:
 *
 *   1. no untranslated i18n keys rendered anywhere on any tab
 *   2. every tab renders and the stream really advances at the requested rate
 *   3. the race keeps running after the first lane finishes
 *   4. the live tab measures a mock endpoint end to end
 *
 * Usage:
 *   python3 -m http.server 8812 --bind 127.0.0.1 &
 *   python3 tools/mock_endpoint.py --port 8899 --rate 40 --ttft 0.5 &
 *   bun tools/verify.mjs [cdpPort] [baseUrl]
 */

const port = process.argv[2] || '9466';
const base = process.argv[3] || 'http://127.0.0.1:8812';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
if (!target) {
  console.error('no page target on CDP port', port);
  process.exit(2);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const exceptions = [];

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(msg.params.exceptionDetails.text + ' ' +
      (msg.params.exceptionDetails.exception?.description || ''));
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await new Promise((r) => { ws.onopen = r; });

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Page.enable');

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

const goto = async (path) => {
  await send('Page.navigate', { url: `${base}/${path}` });
  await sleep(1800);
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/* 1 ── no untranslated keys, in both languages, on every tab */
await goto(`?v=${Date.now()}`);
for (const lang of ['ru', 'en']) {
  await evaluate(`localStorage.setItem('ts.lang', ${JSON.stringify(lang)})`);
  for (const tab of ['single', 'race', 'live', 'about']) {
    await goto(`?v=${Date.now()}#tab=${tab}`);
    const leaks = await evaluate(
      `JSON.stringify([...document.querySelectorAll('body *')]
        .filter(el => el.children.length === 0 && /(?:^|[\\s])(about|ctl|btn|tab|live|stat|single|race|unit|foot|err)\\.[a-z0-9.]+/.test(el.textContent))
        .map(el => el.textContent.trim().slice(0, 40)))`);
    check(`i18n ${lang}/${tab} renders no raw keys`, leaks === '[]', leaks === '[]' ? '' : leaks);
  }
}

/* 1b ── shared-state deep links open the right tab with the right settings */
for (const [tab, tps] of [['race', null], ['live', null], ['about', null], ['single', 40]]) {
  await goto(`?v=${Date.now()}#tab=${tab}${tps ? `&tps=${tps}` : ''}`);
  const got = await evaluate(`JSON.stringify({
    active: document.querySelector('.tab.is-active').dataset.tab,
    visible: [...document.querySelectorAll('.panel')].filter(p => !p.hidden).map(p => p.id),
    tps: document.querySelector('#speedOut').textContent,
  })`);
  const g = JSON.parse(got);
  check(`deep link #tab=${tab} opens that tab`, g.active === tab && g.visible.join() === `panel-${tab}`, got);
  if (tps) check(`deep link #tab=single&tps=${tps} restores the speed`,
    Math.abs(parseFloat(g.tps) - tps) / tps < 0.02, `slider shows ${g.tps}`);
}

/* 2 ── the stream holds the requested rate */
await goto(`?v=${Date.now()}#tab=single`);
const rate = await evaluate(`(async () => {
  const t = window.__ts;
  t.resetSingle();
  const s = document.querySelector('#speed');
  s.value = String(t.tpsToSlider(60)); s.dispatchEvent(new Event('input'));
  const sample = document.querySelector('#sample'); sample.value = 'mech';
  document.querySelector('#playBtn').click();
  await new Promise(r => setTimeout(r, 9000));
  const cells = [...document.querySelectorAll('#singleStats .stat')]
    .map(x => x.dataset.key + '=' + x.querySelector('.stat-v').textContent);
  const target = Number(document.querySelector('#speedOut').textContent);
  const actual = parseFloat((cells.find(c => c.startsWith('stat.actual')) || '=0').split('=')[1]) || 0;
  const tokens = (cells.find(c => c.startsWith('stat.tokens')) || '=0/0').split('=')[1];
  return { target, actual, tokens, cells };
})()`);
check('single stream advances', rate.tokens && rate.tokens !== '0 / 0', rate.cells.join(' · '));
check('single stream rate within 12% of target',
  rate.actual > 0 && Math.abs(rate.actual - rate.target) / rate.target < 0.12,
  `${rate.actual} vs ${rate.target} tok/s`);

/* 3 ── race keeps going after the fastest lane finishes */
await goto(`?v=${Date.now()}#tab=race`);
const race = await evaluate(`(async () => {
  window.__ts.startRace();
  await new Promise(r => setTimeout(r, 6000));
  const metas = [...document.querySelectorAll('.lane-meta')].map(m => m.textContent);
  const done = metas.filter(m => { const mm = m.match(/(\\d+) \\/ (\\d+)/); return mm && mm[1] === mm[2]; });
  const ranked = metas.every(m => /#\\d/.test(m));
  window.__ts.stopRace();
  return { metas, finished: done.length, ranked };
})()`);
check('race ranks every lane live', race.ranked, race.metas.join(' | '));
check('race keeps running after the first finisher', race.finished === 1, `${race.finished} lane(s) finished at 6 s`);

/* 4 ── live measurement end to end against the mock endpoint */
await goto(`?v=${Date.now()}#tab=live`);
const live = await evaluate(`(async () => {
  localStorage.removeItem('ts.history');
  const set = (id, v) => { const el = document.querySelector(id); el.value = v; el.dispatchEvent(new Event('change')); };
  set('#baseUrl', 'http://127.0.0.1:8899/v1');
  set('#model', 'mock-fast-1');
  set('#maxTokens', '60');
  document.querySelector('#liveBtn').click();
  await new Promise(r => setTimeout(r, 6000));
  const cells = [...document.querySelectorAll('#liveStats .stat')]
    .map(x => x.dataset.key + '=' + x.querySelector('.stat-v').textContent);
  return { cells, history: JSON.parse(localStorage.getItem('ts.history') || 'null'), err: document.querySelector('#liveError').hidden ? '' : document.querySelector('#liveError').textContent };
})()`);
// An https page cannot call an http mock endpoint — the browser blocks it as
// mixed content, which is correct. So on https the assertion is not "it
// measured" but "it failed loudly and left no half-written state".
const pageIsHttps = base.startsWith('https://');

if (pageIsHttps) {
  check('live tab reports the blocked request instead of hanging',
    live.cells.length === 0 || live.cells.every((c) => !c.endsWith('=—')),
    live.cells.length ? live.cells.join(' · ') : 'no stats written (request blocked by the browser)');
  check('live tab surfaces an error message', live.err.length > 0, live.err.slice(0, 120) || '(no error shown)');
  check('live tab writes nothing to history when blocked', !live.history,
    live.history ? JSON.stringify(live.history).slice(0, 120) : 'history clean');
} else {
  // `every` on an empty array is true: an empty stats row used to pass this
  // check while nothing had run at all.
  check('live measurement fills the stats row',
    live.cells.length === 6 && live.cells.every((c) => !c.endsWith('=—')),
    live.cells.length ? live.cells.join(' · ') : 'stats row empty — nothing ran');
  check('live measurement stores history', !!(live.history && live.history[0]),
    live.history && live.history[0]
      ? `ttft=${live.history[0].ttftMs.toFixed(0)}ms tps=${live.history[0].tpsDecode}`
      : (live.err || 'history empty'));
  check('live measurement reports no error', live.err === '', live.err.slice(0, 120));
}

/* 5 ── no uncaught exceptions anywhere in that run */
check('no uncaught page exceptions', exceptions.length === 0, exceptions.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
ws.close();
process.exit(failed.length ? 1 : 0);