/**
 * app.js — UI wiring.
 *
 * No framework on purpose: the whole point of this page is that it opens from a
 * github.io URL and works, and every dependency is something that can rot.
 */

import { CORPUS, corpusById, ENCODING, TOTAL_TOKENS, chunkTokens } from './corpus.js';
import { GROUPS, PRESETS, RACE_LANES, presetById } from './presets.js';
import { Stream, Series } from './player.js';
import { runLive, listModels, corsHint } from './live.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SPEED_MIN = 0.1;
const SPEED_MAX = 300;
const LOG_LO = Math.log10(SPEED_MIN);
const LOG_SPAN = Math.log10(SPEED_MAX) - LOG_LO;

const sliderToTps = (v) => 10 ** (LOG_LO + (v / 1000) * LOG_SPAN);
const tpsToSlider = (t) => Math.round(((Math.log10(Math.max(SPEED_MIN, t)) - LOG_LO) / LOG_SPAN) * 1000);
const fmtTps = (t) => (t >= 10 ? t.toFixed(1) : t.toFixed(2));
const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : s.toFixed(2));
const fmtMs = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

/* ────────────────────────────── i18n ────────────────────────────── */

const I18N = {
  ru: {
    'tagline': 'сколько токенов в секунду значит на самом деле',
    'tab.single': 'Один поток', 'tab.race': 'Гонка', 'tab.live': 'Живой замер', 'tab.about': 'Как считается',
    'single.lede': 'Скорость задаётся ползунком, но ощущается она не по ней одной: сначала пауза до первого токена, потом ровный или рваный поток. Оба параметра здесь настраиваются.',
    'ctl.speed': 'Скорость', 'ctl.ttft': 'До первого токена', 'ctl.jitter': 'Неровность потока', 'ctl.sample': 'Текст',
    'unit.tps': 'т/с',
    'btn.play': 'Запустить', 'btn.reset': 'Сбросить', 'btn.race': 'Старт гонки', 'btn.measure': 'Измерить', 'btn.clear': 'Очистить',
    'race.lede': 'Один и тот же текст в нескольких потоках сразу. Видно, кто отстаёт не из-за медленных токенов, а из-за ожидания первого.',
    'live.lede': 'Замер против любого эндпоинта, который говорит на OpenAI-совместимом API. Запрос уходит из вашего браузера напрямую на указанный адрес.',
    'live.security': 'Ключ не покидает браузер: он хранится в памяти вкладки и уходит только по указанному вами адресу. Если включено «помнить», ключ попадает в localStorage этого браузера — на общем компьютере это небезопасно.',
    'live.base': 'Базовый URL', 'live.key': 'Ключ API', 'live.model': 'Модель', 'live.max': 'Макс. токенов',
    'live.remember': 'Помнить ключ', 'live.models': 'Список моделей', 'live.prompt': 'Запрос',
    'live.history': 'История замеров',
    'foot.note': 'Токены — настоящие, cl100k_base. Скорость в демо задаётся ползунком, а не измеряется.',
    'stat.target': 'Задано', 'stat.actual': 'Фактически', 'stat.ttft': 'До 1-го токена', 'stat.elapsed': 'Прошло',
    'stat.tokens': 'Токенов', 'stat.eta': 'Осталось', 'stat.chunks': 'Фрагментов', 'stat.itl': 'Интервал между токенами',
    'stat.ittl': 'Медиана / p95', 'stat.decodetps': 'т/с декод', 'stat.totaltps': 'т/с всего', 'stat.waiting': 'ждём первый токен…',
    'err.abort': 'Замер остановлен.',
    'about.intro': 'Эта страница отвечает на вопрос «как быстро это будет выглядеть». Все три числа, которые её описывают, считаются по-разному, и их регулярно путают.',
    'about.h2.1': 'Токен в секунду — это средняя скорость',
    'about.p.1': 'Скорость считают как «сколько токенов пришло за секунду». Но человек видит не среднее, а худший промежуток. Десять токенов подряд ровно и двадцать токенов, из которых половина пришла разом, читаются одинаково медленно.',
    'about.h2.2': 'До первого токена — половина ощущения',
    'about.p.2': 'Префилл (чтение запроса) идёт до первого токена, и всё это время экран пуст. У размышляющих моделей это секунды. Именно этот интервал люди называют «модель думает», и он не зависит от скорости декода.',
    'about.h2.3': 'Почему здесь нет setInterval',
    'about.p.3': 'Обычная реализация — это setInterval(1000 / tps), и она врёт. Замерено в Chromium 154 на машине, где собран этот репозиторий: интервал 5 мс (200 т/с), тело callback занимает 25 мс — выходит 40.3 токена в секунду вместо двухсот, с медианным промежутком 25 мс вместо 5. Демонстрация про скорость, которая сообщает не ту скорость, на которой работает, хуже отсутствия демонстрации.\n\nЗдесь график считается, а не планируется: каждый кадр спрашивается «сколько токенов должно быть уже выведено», и разница догоняется. Замер этой страницы: 10.03 при 10 т/с, 25.11 при 25, 151.01 при 150, 252.01 при 250.',
    'about.h2.4': 'Откуда берутся тексты',
    'about.p.4': 'Примеры разбиты на токены настоящим токенизатором cl100k_base (tiktoken) офлайн, скриптом tools/build_corpus.py, и результат лежит в репозитории. Поэтому стрим показывает ровно то, что увидела бы GPT-класса модель, а длина каждого примера известна точно.',
    'about.h2.5': 'Про пресеты',
    'about.p.5': 'Значения в кнопках — порядок величин для класса конфигурации, а не измерения конкретной модели. Точные цифры зависят от квантизации, длины контекста, батчера и нагрузки на сервер. Если нужна правда — измеряйте во вкладке «Живой замер» или на своём локальном эндпоинте.',
  },
  en: {
    'tagline': 'what tokens per second actually feel like',
    'tab.single': 'Single stream', 'tab.race': 'Race', 'tab.live': 'Live measurement', 'tab.about': 'How it is measured',
    'single.lede': 'Speed is set by the slider, but that is not what you feel: first the wait before the first token, then a stream that is either even or lumpy. Both are adjustable here.',
    'ctl.speed': 'Speed', 'ctl.ttft': 'Before first token', 'ctl.jitter': 'Stream unevenness', 'ctl.sample': 'Text',
    'unit.tps': 'tok/s',
    'btn.play': 'Run', 'btn.reset': 'Reset', 'btn.race': 'Start race', 'btn.measure': 'Measure', 'btn.clear': 'Clear',
    'race.lede': 'The same text in several streams at once. You can see who falls behind not because tokens are slow, but because of the wait for the first one.',
    'live.lede': 'Measure any endpoint that speaks the OpenAI-compatible API. The request goes from your browser straight to the address you type.',
    'live.security': 'The key never leaves the browser: it lives in the tab and is sent only to the address you typed. With “remember” on, it also lands in this browser’s localStorage — do not use that on a shared machine.',
    'live.base': 'Base URL', 'live.key': 'API key', 'live.model': 'Model', 'live.max': 'Max tokens',
    'live.remember': 'Remember key', 'live.models': 'List models', 'live.prompt': 'Prompt',
    'live.history': 'Measurement history',
    'foot.note': 'Tokens are real, cl100k_base. Speed in the demo comes from the slider, not from a measurement.',
    'stat.target': 'Target', 'stat.actual': 'Achieved', 'stat.ttft': 'First token', 'stat.elapsed': 'Elapsed',
    'stat.tokens': 'Tokens', 'stat.eta': 'Left', 'stat.chunks': 'Chunks', 'stat.itl': 'Inter-token gap',
    'stat.ittl': 'Median / p95', 'stat.decodetps': 'tok/s decode', 'stat.totaltps': 'tok/s overall', 'stat.waiting': 'waiting for first token…',
    'err.abort': 'Measurement stopped.',
    'about.intro': 'This page answers one question: how fast will it look. The three numbers that describe it are computed differently, and they are constantly confused with each other.',
    'about.h2.1': 'Tokens per second is an average',
    'about.p.1': 'Speed is computed as “how many tokens arrived in a second”. But nobody perceives an average — people perceive the worst gap. Ten tokens at an even rhythm and twenty tokens where half arrive at once read identically slow.',
    'about.h2.2': 'The first token is half of the feeling',
    'about.p.2': 'Prefill (reading your prompt) happens before the first token, and the screen is blank the whole time. For reasoning models that is seconds. This interval is what people call “the model is thinking”, and it does not depend on decode speed.',
    'about.h2.3': 'Why there is no setInterval here',
    'about.p.3': 'The obvious implementation is setInterval(1000 / tps), and it lies. Measured in Chromium 154 on the machine this repo was built on: a 5 ms interval (200 tok/s) whose callback costs 25 ms delivers 40.3 tokens/s — five times slower than the number it was asked for, with a median gap of 25 ms instead of 5 ms. A demo about speed that reports a speed it does not run at is worse than no demo.\n\nHere the schedule is computed rather than timed: every frame asks how many tokens should already have been emitted, and the difference is caught up. This page measures 10.03 at 10 tok/s, 25.11 at 25, 151.01 at 150, 252.01 at 250.',
    'about.h2.4': 'Where the texts come from',
    'about.p.4': 'The samples are split into tokens by the real cl100k_base tokenizer (tiktoken) offline, by tools/build_corpus.py, and the result is committed. So the stream shows exactly what a GPT-class tokenizer would emit, and the length of every sample is known exactly.',
    'about.h2.5': 'About the presets',
    'about.p.5': 'The preset buttons are order-of-magnitude values for a class of setup, not measurements of any particular model. Real numbers depend on quantization, context length, the batching server and current load. If you need the truth, measure it in the Live tab or against your local endpoint.',
  },
};

// [heading, paragraph] as ready text — NOT i18n keys. A key that exists in
// only one language dictionary silently renders as the key itself in the other,
// which is exactly how «about.h2.6» shipped to production once.
const ABOUT_EXTRA = {
  ru: [
    ['Что здесь не измеряется',
      'Демо ничего не отправляет провайдеру и ничего не замеряет само. Все числа на вкладках «Один поток» и «Гонка» — результат настроек ползунков, а не скорость какой-либо модели. Единственное место, где появляются измеренные числа, — вкладка «Живой замер», и там они всегда подписаны источником.'],
  ],
  en: [
    ['What is not measured here',
      'The demo sends nothing to any provider and measures nothing on its own. Every number in the Single and Race tabs is the result of the sliders, not the speed of any model. The only place measured numbers appear is the Live tab, and there they are always labelled with their source.'],
  ],
};

let lang = 'ru';
const t = (key) => I18N[lang][key] ?? I18N.en[key] ?? key;

function applyI18n() {
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#langToggle').textContent = lang === 'ru' ? 'EN' : 'RU';
  renderAbout();
  renderPresets();
  renderSampleSelects();
  buildLanes();
  refreshLabels();
}

/* ────────────────────────────── tabs ────────────────────────────── */

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((x) => { x.classList.toggle('is-active', x === tab); x.setAttribute('aria-selected', String(x === tab)); });
    $$('.panel').forEach((p) => {
      const on = p.id === `panel-${tab.dataset.tab}`;
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
    if (tab.dataset.tab === 'live') drawChart();
    syncUrl();
  });
});

$('#langToggle').addEventListener('click', () => {
  lang = lang === 'ru' ? 'en' : 'ru';
  localStorage.setItem('ts.lang', lang);
  applyI18n();
  syncUrl();
});

/* ────────────────────────────── about ───────────────────────────── */

function renderAbout() {
  const body = $('#aboutBody');
  body.textContent = '';

  // Entries may carry \n\n to mean a paragraph break.
  const add = (tag, text) => {
    for (const part of String(text).split('\n\n')) {
      const el = document.createElement(tag);
      el.textContent = part;
      body.appendChild(el);
    }
  };

  add('p', t('about.intro'));
  // Both halves are already-localised strings by this point.
  const sections = [
    ['about.h2.1', 'about.p.1'], ['about.h2.2', 'about.p.2'], ['about.h2.3', 'about.p.3'],
    ['about.h2.4', 'about.p.4'], ['about.h2.5', 'about.p.5'],
  ].map(([h, p]) => [t(h), t(p)]);
  for (const [heading, text] of [...sections, ...ABOUT_EXTRA[lang]]) {
    const h = document.createElement('h2');
    h.textContent = heading;
    body.appendChild(h);
    add('p', text);
  }
  const foot = document.createElement('p');
  foot.textContent = lang === 'ru'
    ? `${ENCODING} · ${TOTAL_TOKENS} токенов в примерах`
    : `${ENCODING} · ${TOTAL_TOKENS} tokens across the samples`;
  body.appendChild(foot);
}

/* ───────────────────────────── presets ──────────────────────────── */

let activePreset = null;

function renderPresets() {
  const host = $('#presetGroups');
  host.textContent = '';
  for (const g of GROUPS) {
    const items = PRESETS.filter((p) => p.group === g.id);
    if (!items.length) continue;
    const group = document.createElement('div');
    group.className = 'preset-group';
    const h = document.createElement('h2');
    h.textContent = g.title[lang];
    group.appendChild(h);

    const list = document.createElement('div');
    list.className = 'preset-list';
    for (const p of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset';
      btn.dataset.preset = p.id;
      const b = document.createElement('b');
      b.textContent = p.label[lang];
      const s = document.createElement('span');
      s.className = 'tps';
      s.textContent = `${fmtTps(p.tps)} ${t('unit.tps')} · ${p.ttftMs} ms`;
      const n = document.createElement('small');
      n.textContent = p.note[lang];
      btn.append(b, s, n);
      btn.addEventListener('click', () => applyPreset(p.id, true));
      list.appendChild(btn);
    }
    group.appendChild(list);
    host.appendChild(group);
  }
  markActivePreset();
}

function markActivePreset() {
  $$('.preset').forEach((b) => b.classList.toggle('is-active', b.dataset.preset === activePreset));
}

function applyPreset(id, autoplay) {
  const p = presetById(id);
  if (!p) return;
  activePreset = id;
  $('#speed').value = tpsToSlider(p.tps);
  $('#ttft').value = p.ttftMs;
  refreshLabels();
  markActivePreset();
  if (autoplay) {
    resetSingle();
    startSingle();
  }
}

function renderSampleSelects() {
  for (const id of ['#sample', '#raceSample']) {
    const sel = $(id);
    if (!sel) continue;
    const prev = sel.value;
    sel.textContent = '';
    for (const c of CORPUS) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.title[lang] + ` · ${c.count}`;
      sel.appendChild(o);
    }
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }
}

/* ─────────────────────── single stream engine ─────────────────── */

const speedEl = $('#speed');
const ttftEl = $('#ttft');
const jitterEl = $('#jitter');
const streamEl = $('#singleStream');
let stream = null;
let cursor = null;

function refreshLabels() {
  const tps = sliderToTps(+speedEl.value);
  $('#speedOut').textContent = fmtTps(tps);
  $('#ttftOut').textContent = ttftEl.value;
  $('#jitterOut').textContent = jitterEl.value;
  syncUrl();
}

function currentSpeed() { return sliderToTps(+speedEl.value); }
function currentTtft() { return +ttftEl.value; }
function currentJitter() { return +jitterEl.value / 100; }

function makeCursor() {
  cursor = document.createElement('span');
  cursor.className = 'cursor';
}

function streamOptions() {
  return {
    chunks: corpusById($('#sample').value).tokens,
    tps: currentSpeed(),
    ttftMs: currentTtft(),
    jitter: currentJitter(),
    stall: currentJitter() > 0 ? 0.06 : 0,
  };
}

function stopSingle() {
  if (stream) stream.stop();
  stream = null;
  cursor?.remove();
  cursor = null;
  streamEl.classList.remove('is-waiting');
  $('#playBtn').textContent = t('btn.play');
}

function resetSingle() {
  stopSingle();
  streamEl.textContent = '';
  streamEl.classList.remove('is-waiting');
  $('#singleStats').textContent = '';
  $('#playBtn').textContent = t('btn.play');
}

function startSingle() {
  stopSingle();
  streamEl.textContent = '';
  const opts = streamOptions();
  stream = new Stream({
    ...opts,
    onToken: (piece) => {
      streamEl.append(document.createTextNode(piece));
      streamEl.scrollTop = streamEl.scrollHeight;
    },
    onState: (st, reason) => {
      renderSingleStats(st);
      if (reason === 'done') {
        cursor?.remove();
        cursor = null;
        $('#playBtn').textContent = t('btn.play');
        stream = null;
      }
    },
  });
  streamEl.classList.toggle('is-waiting', currentTtft() > 0);
  makeCursor();
  stream.start();
  $('#playBtn').textContent = t('btn.reset');
}

$('#playBtn').addEventListener('click', () => (stream ? stopSingle() : startSingle()));
$('#resetBtn').addEventListener('click', resetSingle);
['#speed', '#ttft', '#jitter'].forEach((id) => $(id).addEventListener('input', () => {
  refreshLabels();
  activePreset = null;
  markActivePreset();
}));

let statNodes = {};
function ensureStatNodes(keys) {
  const host = $('#singleStats');
  if (statNodes.__keys && statNodes.__keys.join() === keys.join() && host.children.length) return;
  host.textContent = '';
  statNodes = { __keys: keys };
  for (const k of keys) {
    const box = document.createElement('div');
    box.className = 'stat';
    // data-key keeps automated checks readable regardless of the UI language —
    // parsing the visible label makes the suite fail only in Russian or English.
    box.dataset.key = k;
    const kk = document.createElement('div');
    kk.className = 'stat-k';
    kk.textContent = t(k);
    const vv = document.createElement('div');
    vv.className = 'stat-v';
    vv.textContent = '—';
    box.append(kk, vv);
    host.appendChild(box);
    statNodes[k] = { box, vv };
  }
}

function renderSingleStats(st) {
  const keys = ['stat.target', 'stat.actual', 'stat.ttft', 'stat.elapsed', 'stat.tokens', 'stat.eta'];
  ensureStatNodes(keys);
  const set = (k, v, cls) => {
    const n = statNodes[k];
    n.vv.textContent = v;
    n.box.className = `stat${cls ? ` stat--${cls}` : ''}`;
  };
  const opts = streamOptions();
  set('stat.target', `${fmtTps(opts.tps)} ${t('unit.tps')}`);
  set('stat.actual', st.achievedTps ? `${fmtTps(st.achievedTps)} ${t('unit.tps')}` : '—',
    st.achievedTps && Math.abs(st.achievedTps - opts.tps) / opts.tps > 0.12 ? 'warn' : '');
  set('stat.ttft', st.waitingFirst ? t('stat.waiting') : st.ttftMs ? fmtMs(st.ttftMs) : `${opts.ttftMs} ms`);
  set('stat.elapsed', `${fmtSec(st.elapsed)} s`);
  set('stat.tokens', `${st.emitted} / ${st.total}`);
  set('stat.eta', st.running ? `~${fmtSec(st.etaSec)} s` : '—');
}

/* ───────────────────────────── race ────────────────────────────── */

const laneViews = new Map();
let raceRunning = false;

function buildLanes() {
  const host = $('#raceLanes');
  host.textContent = '';
  laneViews.clear();
  for (const lane of RACE_LANES) {
    const p = presetById(lane.presetId);
    const el = document.createElement('div');
    el.className = 'lane';
    el.style.setProperty('--lane', lane.color);
    el.innerHTML = `
      <div class="lane-head">
        <span class="lane-name"></span>
        <span class="lane-rate"></span>
        <span class="lane-meta"></span>
      </div>
      <div class="track"><div class="track-fill"></div><div class="track-flag"></div></div>
      <div class="lane-text"></div>`;
    el.querySelector('.lane-name').textContent = lane.label[lang];
    el.querySelector('.lane-rate').textContent =
      `${fmtTps(p.tps)} ${t('unit.tps')} · TTFT ${p.ttftMs} ms`;
    host.appendChild(el);
    laneViews.set(lane.id, {
      el,
      fill: el.querySelector('.track-fill'),
      meta: el.querySelector('.lane-meta'),
      text: el.querySelector('.lane-text'),
      preset: p,
      stream: null,
      lastRender: 0,
    });
  }
  if (!raceRunning) renderRaceIdle();
}

function renderRaceIdle() {
  for (const v of laneViews.values()) {
    v.fill.style.width = '0%';
    v.text.textContent = '';
    v.meta.textContent = `0 / ${corpusById($('#raceSample').value).tokens.length}`;
  }
}

function startRace() {
  stopRace();
  const chunks = corpusById($('#raceSample').value).tokens;
  const t0 = performance.now();
  for (const [id, v] of laneViews) {
    v.text.textContent = '';
    v.fill.style.width = '0%';
    v.lastRender = 0;
    v.stream = new Stream({
      chunks,
      tps: v.preset.tps,
      ttftMs: v.preset.ttftMs,
      jitter: currentJitter(),
      stall: currentJitter() > 0 ? 0.06 : 0,
      onToken: (piece) => {
        v.text.append(document.createTextNode(piece));
        if (v.text.textContent.length > 600) v.text.textContent = v.text.textContent.slice(-600);
      },
      onState: () => {},
    });
    v.stream.start();
  }
  raceRunning = true;
  $('#raceBtn').textContent = t('btn.reset');

  const paint = () => {
    if (!raceRunning) return;
    const now = performance.now();

    // Live ranking every frame: finished lanes keep their place, unfinished ones
    // are ordered by how far they got. The race does NOT stop when the first
    // lane finishes — that is the whole point of a race.
    const rows = [...laneViews.entries()].map(([id, v]) => {
      const st = v.stream ? v.stream.stats() : { emitted: 0, total: 1, progress: 0, done: false };
      return { id, v, st };
    });
    rows.sort((a, b) => {
      if (a.st.done !== b.st.done) return a.st.done ? -1 : 1;
      return b.st.progress - a.st.progress;
    });

    rows.forEach(({ id, v, st }, i) => {
      v.fill.style.width = `${(st.progress * 100).toFixed(2)}%`;
      const time = st.done
        ? `${((st.endedAtMs - t0) / 1000).toFixed(2)} s`
        : `${((now - t0) / 1000).toFixed(2)} s`;
      v.meta.textContent = `${st.emitted} / ${st.total} · ${time} · #${i + 1}`;
      v.text.scrollTop = v.text.scrollHeight;
    });

    if (rows.every((r) => r.st.done)) {
      for (const v of laneViews.values()) v.stream = null;
      raceRunning = false;
      $('#raceBtn').textContent = t('btn.race');
      return;
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}

function stopRace() {
  for (const v of laneViews.values()) if (v.stream) v.stream.stop();
  raceRunning = false;
  $('#raceBtn').textContent = t('btn.race');
}

$('#raceBtn').addEventListener('click', () => (raceRunning ? stopRace() : startRace()));
$('#raceResetBtn').addEventListener('click', () => { stopRace(); renderRaceIdle(); });
$('#raceSample').addEventListener('change', () => { stopRace(); renderRaceIdle(); });

/* ───────────────────────────── live ────────────────────────────── */

const liveStreamEl = $('#liveStream');
const liveStatsEl = $('#liveStats');
const formEl = {
  baseUrl: $('#baseUrl'), apiKey: $('#apiKey'), model: $('#model'),
  maxTokens: $('#maxTokens'), rememberKey: $('#rememberKey'), prompt: $('#prompt'),
};

const DEFAULTS = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  maxTokens: 256,
  prompt: 'Ответь одним абзацем: почему скорость генерации важнее, чем кажется.',
};

function loadForm() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('ts.live.form') || '{}'); } catch { saved = {}; }
  formEl.baseUrl.value = saved.baseUrl ?? DEFAULTS.baseUrl;
  formEl.model.value = saved.model ?? DEFAULTS.model;
  formEl.maxTokens.value = saved.maxTokens ?? DEFAULTS.maxTokens;
  formEl.prompt.value = saved.prompt ?? DEFAULTS.prompt;
  formEl.rememberKey.checked = !!saved.rememberKey;
  if (saved.rememberKey && saved.apiKey) formEl.apiKey.value = saved.apiKey;
}

function saveForm() {
  const data = {
    baseUrl: formEl.baseUrl.value.trim(),
    model: formEl.model.value.trim(),
    maxTokens: Number(formEl.maxTokens.value) || DEFAULTS.maxTokens,
    prompt: formEl.prompt.value,
    rememberKey: formEl.rememberKey.checked,
  };
  if (formEl.rememberKey.checked) data.apiKey = formEl.apiKey.value;
  localStorage.setItem('ts.live.form', JSON.stringify(data));
}

let abort = null;
let liveSeries = new Series();

function setError(msg) {
  const box = $('#liveError');
  if (!msg) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.textContent = msg;
}

function liveStatRow() {
  liveStatsEl.textContent = '';
  const nodes = {};
  for (const k of ['stat.ttft', 'stat.decodetps', 'stat.totaltps', 'stat.itl', 'stat.ittl', 'stat.tokens']) {
    const box = document.createElement('div');
    box.className = 'stat';
    box.dataset.key = k;
    const kk = document.createElement('div'); kk.className = 'stat-k'; kk.textContent = t(k);
    const vv = document.createElement('div'); vv.className = 'stat-v'; vv.textContent = '—';
    box.append(kk, vv);
    liveStatsEl.appendChild(box);
    nodes[k] = vv;
  }
  return nodes;
}

let liveNodes = null;

/**
 * Values arrive as { 'stat.ttft': '541 ms', … } — the keys the stat row was
 * built with. They must be written into the nodes, not assigned over them:
 * Object.assign onto the map would replace the element references with strings
 * and the display would freeze on '—' forever.
 */
function updateLiveStats(patch) {
  if (!liveNodes) liveNodes = liveStatRow();
  for (const [key, value] of Object.entries(patch)) {
    const node = liveNodes[key];
    if (node) node.textContent = value;
  }
}

const chartSamples = [];

function drawChart() {
  const c = $('#tpsChart');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth || 800;
  const h = 140;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const styles = getComputedStyle(document.documentElement);
  const line = styles.getPropertyValue('--line-soft').trim() || '#22303f';
  const mute = styles.getPropertyValue('--fg-mute').trim() || '#6b7d8d';
  const accent = styles.getPropertyValue('--accent').trim() || '#38bdf8';

  const pad = 8;
  const maxV = Math.max(10, ...chartSamples.map((s) => s.v)) * 1.15;

  g.strokeStyle = line;
  g.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const y = pad + ((h - 2 * pad) * i) / 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
  }

  if (!chartSamples.length) {
    g.fillStyle = mute;
    g.font = '12px ui-monospace, monospace';
    g.fillText('—', pad + 2, h / 2);
    return;
  }
  g.strokeStyle = accent;
  g.lineWidth = 1.6;
  g.beginPath();
  const n = chartSamples.length;
  chartSamples.forEach((s, i) => {
    const x = pad + ((w - 2 * pad) * i) / Math.max(1, n - 1);
    const y = h - pad - ((h - 2 * pad) * s.v) / maxV;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke();

  g.fillStyle = mute;
  g.font = '11px ui-monospace, monospace';
  g.fillText(`${maxV.toFixed(0)} ${t('unit.tps')}`, pad + 2, pad + 11);
  g.fillText(`${n} s`, w - pad - 26, h - 2);
}

async function runMeasurement() {
  if (abort) { abort.abort(); return; }
  saveForm();
  setError(null);

  const baseUrl = formEl.baseUrl.value.trim().replace(/\/+$/, '');
  const model = formEl.model.value.trim();
  if (!baseUrl || !model) {
    setError(lang === 'ru' ? 'Нужны базовый URL и имя модели.' : 'Base URL and model are required.');
    return;
  }

  abort = new AbortController();
  $('#liveBtn').textContent = t('btn.clear');
  liveStreamEl.textContent = '';
  liveStreamEl.classList.remove('is-waiting');
  chartSamples.length = 0;
  liveSeries.reset();
  liveNodes = null;
  const t0 = performance.now();
  let firstDeltaAt = 0;
  let lastSampleAt = 0;

  const tick = setInterval(() => {
    if (!firstDeltaAt) return;
    const now = performance.now();
    const v = liveSeries.rate(1000);
    if (now - lastSampleAt >= 250) {
      lastSampleAt = now;
      chartSamples.push({ v });
      if (chartSamples.length > 90) chartSamples.shift();
      drawChart();
    }
    const st = liveSeries.gaps();
    updateLiveStats({
      'stat.ttft': fmtMs(firstDeltaAt - t0),
      'stat.decodetps': v ? v.toFixed(1) : '—',
      'stat.totaltps': (liveSeries.t.length / ((now - t0) / 1000)).toFixed(1),
      'stat.itl': st.n ? `${st.mean.toFixed(0)} ms` : '—',
      'stat.ittl': st.n ? `${st.p50.toFixed(0)} / ${st.p95.toFixed(0)} ms` : '—',
      'stat.tokens': String(liveSeries.t.length),
    });
  }, 200);

  try {
    const res = await runLive({
      baseUrl,
      apiKey: formEl.apiKey.value.trim(),
      model,
      prompt: formEl.prompt.value,
      maxTokens: Number(formEl.maxTokens.value),
      signal: abort.signal,
      timeoutMs: 30000,
      onDelta: (piece) => {
        const now = performance.now();
        if (!firstDeltaAt) {
          firstDeltaAt = now;
          liveStreamEl.classList.remove('is-waiting');
        }
        // Every arrival is pushed, including the first: the series then holds
        // one entry per chunk, and gaps() derives the inter-token latencies.
        liveSeries.push(now);
        liveStreamEl.append(document.createTextNode(piece));
        liveStreamEl.scrollTop = liveStreamEl.scrollHeight;
      },
    });

    clearInterval(tick);
    const st = liveSeries.gaps();
    updateLiveStats({
      'stat.ttft': res.ttftMs == null ? '—' : fmtMs(res.ttftMs),
      'stat.decodetps': res.tpsDecode.toFixed(1),
      'stat.totaltps': res.tpsTotal.toFixed(1),
      'stat.itl': st.n ? `${st.mean.toFixed(0)} ms ± ${st.sd.toFixed(0)}` : '—',
      'stat.ittl': st.n ? `${st.p50.toFixed(0)} / ${st.p95.toFixed(0)} ms` : '—',
      'stat.tokens': res.tokensExact
        ? `${res.tokens} ${lang === 'ru' ? '(usage)' : '(usage)'}`
        : `${res.chunks} ${lang === 'ru' ? '(фрагм.)' : '(chunks)'}`,
    });
    addHistory(res, st);
    if (res.reasoningChars) {
      liveStreamEl.dataset.note = '';
    }
  } catch (e) {
    clearInterval(tick);
    if (e.name === 'AbortError') {
      setError(t('err.abort'));
    } else {
      setError(e.friendly ? e.message : `${e.message}`);
      liveStreamEl.classList.remove('is-waiting');
    }
  } finally {
    abort = null;
    $('#liveBtn').textContent = t('btn.measure');
    drawChart();
  }
}

$('#liveBtn').addEventListener('click', runMeasurement);
['#baseUrl', '#apiKey', '#model', '#maxTokens', '#prompt', '#rememberKey'].forEach((id) =>
  $(id).addEventListener('change', saveForm));

$('#modelsBtn').addEventListener('click', async () => {
  const baseUrl = formEl.baseUrl.value.trim().replace(/\/+$/, '');
  if (!baseUrl) return;
  setError(null);
  $('#modelsBtn').disabled = true;
  try {
    const ids = await listModels({ baseUrl, apiKey: formEl.apiKey.value.trim() });
    const dl = $('#modelList');
    dl.textContent = '';
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = id;
      dl.appendChild(o);
    }
    setError(lang === 'ru'
      ? `Модель получена: ${ids.length}. Выберите из списка.`
      : `Fetched ${ids.length} models. Pick one from the list.`);
  } catch (e) {
    setError(`${e.message}\n\n${corsHint(baseUrl)}`);
  } finally {
    $('#modelsBtn').disabled = false;
  }
});

/* ── history ───────────────────────────────────────────────────── */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('ts.history') || '[]'); } catch { return []; }
}

function addHistory(res, itlStats) {
  const rows = loadHistory();
  rows.unshift({
    at: res.at,
    model: res.model,
    baseUrl: res.baseUrl,
    ttftMs: res.ttftMs,
    tpsDecode: +res.tpsDecode.toFixed(2),
    tpsTotal: +res.tpsTotal.toFixed(2),
    itlMean: +(itlStats.mean || 0).toFixed(1),
    itlP95: +(itlStats.p95 || 0).toFixed(1),
    tokens: res.tokens,
    tokensExact: res.tokensExact,
  });
  localStorage.setItem('ts.history', JSON.stringify(rows.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const rows = loadHistory();
  $('#historyCard').hidden = rows.length === 0;
  const table = $('#historyTable');
  table.textContent = '';
  const head = document.createElement('tr');
  for (const h of [lang === 'ru' ? 'Когда' : 'When', lang === 'ru' ? 'Модель' : 'Model',
                   'TTFT', lang === 'ru' ? 'т/с декод' : 'tok/s decode',
                   lang === 'ru' ? 'т/с всего' : 'tok/s total', 'ITL p95',
                   lang === 'ru' ? 'Токены' : 'Tokens']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const r of rows) {
    const tr = document.createElement('tr');
    const cells = [
      new Date(r.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium' }),
      r.model,
      r.ttftMs == null ? '—' : fmtMs(r.ttftMs),
      r.tpsDecode.toFixed(1),
      r.tpsTotal.toFixed(1),
      r.itlP95 ? `${r.itlP95.toFixed(0)} ms` : '—',
      `${r.tokens}${r.tokensExact ? '' : ' ~'}`,
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

$('#historyClear').addEventListener('click', () => {
  localStorage.removeItem('ts.history');
  renderHistory();
});

/* ───────────────────────────── url state ───────────────────────── */

function syncUrl() {
  const p = new URLSearchParams();
  p.set('tab', $('.tab.is-active').dataset.tab);
  p.set('tps', currentSpeed().toFixed(2));
  p.set('ttft', currentTtft());
  p.set('jit', jitterEl.value);
  p.set('sample', $('#sample').value);
  if (lang !== 'ru') p.set('lang', lang);
  history.replaceState(null, '', `#${p.toString()}`);
}

/**
 * Read the shared state from the URL fragment.
 *
 * `raw` must be captured BEFORE applyI18n() runs: applyI18n calls refreshLabels,
 * which calls syncUrl, which replaceStates the hash with the defaults. Reading
 * location.hash afterwards finds our own defaults, and every deep link
 * (#tab=live&tps=25…) silently lands on the default tab.
 */
function loadUrl(raw = initialHash) {
  if (!raw) return;
  raw = raw.replace(/^#/, '');
  if (!raw) return;
  const p = new URLSearchParams(raw);
  const tps = parseFloat(p.get('tps'));
  if (tps > 0) { speedEl.value = tpsToSlider(tps); activePreset = null; }
  if (p.get('ttft')) ttftEl.value = p.get('ttft');
  if (p.get('jit')) jitterEl.value = p.get('jit');
  const sample = p.get('sample');
  if (sample && CORPUS.some((c) => c.id === sample)) { $('#sample').value = sample; $('#raceSample').value = sample; }
  const tab = p.get('tab');
  if (tab) $(`.tab[data-tab="${tab}"]`)?.click();
}

/* ───────────────────────────── boot ───────────────────────────── */

// Captured before anything is allowed to rewrite the fragment.
const initialHash = location.hash;

lang = localStorage.getItem('ts.lang') || 'ru';
loadForm();
applyI18n();
loadUrl(initialHash);
refreshLabels();
renderHistory();
drawChart();
window.addEventListener('resize', drawChart);
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.matches('input, textarea, select, button')) return;
  e.preventDefault();
  const active = $('.tab.is-active').dataset.tab;
  if (active === 'single') (stream ? stopSingle : startSingle)();
  else if (active === 'race') (raceRunning ? stopRace : startRace)();
});

// Exposed for the automated browser check in tools/verify.mjs.
window.__ts = { sliderToTps, tpsToSlider, startSingle, stopSingle, resetSingle, startRace, stopRace, lang: () => lang };