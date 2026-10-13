/**
 * presets.js — speed classes.
 *
 * WHAT THESE NUMBERS ARE: order-of-magnitude class values for "what does this
 * kind of setup usually feel like", used to set the sliders. They are NOT
 * measurements of any particular model and they are NOT a benchmark.
 *
 * WHAT IS NOT HERE ON PURPOSE: a claim that some provider serves exactly N
 * tokens per second. Anyone publishing such a number is quoting a single run on
 * a single machine with a single prompt, and it stops being true the moment you
 * change the prompt. The Live tab measures instead of asserting.
 *
 * `ttftMs` matters at least as much as `tps`: it is the wait before the first
 * token, which is what people actually call "the model is slow".
 */

export const GROUPS = [
  { id: 'gpu',    title: { ru: 'Локально на GPU',        en: 'Local, GPU (fits in VRAM)' } },
  { id: 'cpu',    title: { ru: 'Локально на CPU',        en: 'Local, CPU / RAM' } },
  { id: 'swap',   title: { ru: 'Локально, подгрузка с SSD', en: 'Local, layers offloaded to SSD' } },
  { id: 'api',    title: { ru: 'API через посредника',   en: 'API via a gateway' } },
  { id: 'fast',   title: { ru: 'Быстрые API / спекулятивное декодирование', en: 'Fast API / speculative decoding' } },
  { id: 'think',  title: { ru: 'Модели с размышлением',  en: 'Reasoning models' } },
];

export const PRESETS = [
  { id: 'gpu-8b',    group: 'gpu',  tps: 25,   ttftMs: 180,
    label: { ru: '7–13B, квант Q4', en: '7–13B, Q4 quant' },
    note: { ru: 'целиком в VRAM', en: 'fully in VRAM' } },

  { id: 'gpu-32b',   group: 'gpu',  tps: 14,   ttftMs: 250,
    label: { ru: '30–40B, квант Q4', en: '30–40B, Q4 quant' },
    note: { ru: 'нужна карта от 24 ГБ', en: 'needs ~24 GB of VRAM' } },

  { id: 'gpu-70b',   group: 'gpu',  tps: 8,    ttftMs: 500,
    label: { ru: '70–120B, квант Q4', en: '70–120B, Q4 quant' },
    note: { ru: '2–3 карты или 80 ГБ VRAM', en: '2–3 GPUs or 80 GB VRAM' } },

  { id: 'cpu-8b',    group: 'cpu',  tps: 7,    ttftMs: 400,
    label: { ru: '7–8B на CPU', en: '7–8B on CPU' },
    note: { ru: 'AVX-512, 32 потока', en: 'AVX-512, 32 threads' } },

  { id: 'cpu-14b',   group: 'cpu',  tps: 5,    ttftMs: 500,
    label: { ru: '14B на CPU', en: '14B on CPU' },
    note: { ru: 'декод упирается в память', en: 'decode is memory-bound' } },

  { id: 'cpu-40b',   group: 'cpu',  tps: 2.5,  ttftMs: 900,
    label: { ru: '30–40B на CPU', en: '30–40B on CPU' },
    note: { ru: 'нужно 32+ ГБ RAM', en: 'needs 32+ GB RAM' } },

  { id: 'cpu-70b',   group: 'cpu',  tps: 1.2,  ttftMs: 1800,
    label: { ru: '70B+ на CPU', en: '70B+ on CPU' },
    note: { ru: 'часы на ответ', en: 'minutes per answer' } },

  { id: 'swap-70b',  group: 'swap', tps: 0.35, ttftMs: 4000,
    label: { ru: 'Часть слоёв на SSD', en: 'Some layers on SSD' },
    note: { ru: 'подгрузка весов с диска', en: 'weights stream from disk' } },

  { id: 'api-small', group: 'api',  tps: 45,   ttftMs: 600,
    label: { ru: '7–13B по API', en: '7–13B via API' },
    note: { ru: 'сетевой посредник', en: 'through a gateway' } },

  { id: 'api-mid',   group: 'api',  tps: 28,   ttftMs: 900,
    label: { ru: '30–70B по API', en: '30–70B via API' },
    note: { ru: 'сетевой посредник', en: 'through a gateway' } },

  { id: 'api-big',   group: 'api',  tps: 16,   ttftMs: 1500,
    label: { ru: '100–400B по API', en: '100–400B via API' },
    note: { ru: 'сетевой посредник', en: 'through a gateway' } },

  { id: 'fast-api',  group: 'fast', tps: 90,   ttftMs: 400,
    label: { ru: 'Быстрые модели / спекуляция', en: 'Fast models / speculative' },
    note: { ru: 'stream идёт пачками', en: 'tokens arrive in batches' } },

  { id: 'flash',     group: 'fast', tps: 150,  ttftMs: 300,
    label: { ru: 'Flash-класс, крупный батч', en: 'Flash-class, large batch' },
    note: { ru: 'верхняя граница', en: 'upper end of the range' } },

  { id: 'reasoning', group: 'think', tps: 30,  ttftMs: 8000,
    label: { ru: 'Размышляющая модель', en: 'Reasoning model' },
    note: { ru: 'долгая пауза, потом быстро', en: 'long pause, then fast' } },
];

/** Lanes preloaded in Race mode — deliberately spread across the whole range. */
export const RACE_LANES = [
  { id: 'flash',     presetId: 'flash',     color: '#22d3ee', label: { ru: 'Flash-класс', en: 'Flash class' } },
  { id: 'api-small', presetId: 'api-small', color: '#4ade80', label: { ru: 'API 7–13B',  en: 'API 7–13B' } },
  { id: 'gpu-8b',    presetId: 'gpu-8b',    color: '#a78bfa', label: { ru: 'GPU 7–13B',  en: 'GPU 7–13B' } },
  { id: 'cpu-14b',   presetId: 'cpu-14b',   color: '#fbbf24', label: { ru: 'CPU 14B',    en: 'CPU 14B' } },
  { id: 'swap-70b',  presetId: 'swap-70b',  color: '#fb7185', label: { ru: 'SSD-подгрузка', en: 'SSD offload' } },
];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || null;
}