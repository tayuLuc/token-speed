/**
 * corpus.js — sample texts and how they become tokens.
 *
 * The token arrays are REAL: cl100k_base (tiktoken, the GPT-4/o-series
 * reference tokenizer), tokenized offline by tools/build_corpus.py from
 * tools/texts.json and shipped in assets/corpus-tokens.js. Joining them back
 * reproduces the source text byte for byte, so the demo streams exactly what a
 * GPT-class tokenizer emits — no clever splitting in the browser, no invented
 * numbers in the UI.
 *
 * chunkTokens() at the bottom is a different thing: it approximates BPE
 * splitting for live output from an endpoint that reports no token usage. Its
 * result is called "chunks" in the UI, never "tokens".
 */

import { RAW, ENCODING, TOTAL_TOKENS } from './corpus-tokens.js';

export { ENCODING, TOTAL_TOKENS };

export const CORPUS = RAW.map((r) => ({
  id: r.id,
  lang: r.lang,
  title: { ru: r.titleRu, en: r.titleEn },
  tokens: r.tokens,
  get text() {
    return this.tokens.join('');
  },
  get count() {
    return this.tokens.length;
  },
}));

export function corpusById(id) {
  return CORPUS.find((c) => c.id === id) || CORPUS[0];
}

/**
 * Approximate BPE chunking, for live output where the provider reports no
 * usage. Explicitly NOT a tokenizer; the UI labels its output "chunks".
 *
 * Calibration, measured against cl100k_base on this repo's own corpus
 * (see tools/build_corpus.py): words up to 8 characters stay whole, Latin stems
 * cut into 4s, Cyrillic stems into 2s. Chunk counts come out −43/−71/−71/+169
 * versus the real 368/574/352/185 tokens — roughly ±20 %, which is why the
 * number is displayed as chunks when usage is missing.
 */
export function chunkTokens(text) {
  const CYRILLIC = /[Ѐ-ӿ]/;
  const KEEP = 8;
  const LATIN = 4;
  const CYR = 2;
  const out = [];
  const re = /\r\n|\n|\s+|[^\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const piece = m[0];
    if (piece.length <= KEEP) {
      out.push(piece);
      continue;
    }
    let lead = '';
    let rest = piece;
    if (rest[0] === ' ') {
      lead = ' ';
      rest = rest.slice(1);
      if (rest.length <= KEEP - 1) {
        out.push(lead + rest);
        continue;
      }
    }
    if (/^\d+$/.test(rest)) {
      for (let i = 0; i < rest.length; i += 3) out.push((i ? '' : lead) + rest.slice(i, i + 3));
      continue;
    }
    const m2 = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u.exec(rest);
    const pre = m2 ? m2[1] : '';
    const stem = m2 ? m2[2] : rest;
    const post = m2 ? m2[3] : '';
    if (pre) out.push(pre);
    const size = CYRILLIC.test(stem) ? CYR : LATIN;
    for (let i = 0; i < stem.length; i += size) {
      const p = stem.slice(i, i + size);
      out.push(i === 0 ? (pre ? p : lead + p) : p);
    }
    if (post) out.push(post);
  }
  return out;
}