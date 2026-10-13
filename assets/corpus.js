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
 * Every sample exists in both UI languages, and each language is tokenized on
 * its own. That is not tidiness: the Russian and English versions of the same
 * text have very different token counts (mech is 574 tokens in Russian and 251
 * in English), so a single number attached to a sample would be wrong in one
 * of the two languages. The UI shows the count of the variant it is about to
 * stream, and switching language updates it.
 *
 * The Live tab needs no fallback splitter: it shows the provider's own
 * usage.completion_tokens when one is returned, and the raw delta count
 * otherwise — labelled "chunks", because a delta is not guaranteed to be a
 * token.
 */

import { RAW, ENCODING, LANGS, TOTAL_TOKENS } from './corpus-tokens.js';

export { ENCODING, LANGS, TOTAL_TOKENS };

function buildSample(row) {
  const variants = {};
  for (const lang of LANGS) {
    const v = row.variants[lang];
    variants[lang] = {
      title: v.title,
      tokens: v.tokens,
      text: v.tokens.join(''),
      count: v.tokens.length,
    };
  }
  return { id: row.id, variants };
}

export const CORPUS = RAW.map(buildSample);

export function corpusById(id, lang = 'ru') {
  const sample = CORPUS.find((c) => c.id === id) || CORPUS[0];
  return { ...sample, lang, ...sample.variants[lang] };
}

/** Every sample rendered in `lang`, for a <select>. */
export function corpusOptions(lang = 'ru') {
  return CORPUS.map((c) => {
    const v = c.variants[lang];
    return { id: c.id, title: v.title, count: v.count };
  });
}
