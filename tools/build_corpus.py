#!/usr/bin/env python3
"""
Regenerate assets/corpus-tokens.js from tools/texts.json.

Why the tokens are shipped instead of split in the browser: a demo about token
speed should emit REAL tokens. cl100k_base (the GPT-4 / o-series reference
tokenizer) is the closest widely-available reference, so the streams below are
exactly what a GPT-class tokenizer hands to the model, byte for byte.

Every sample exists in both UI languages, and each language is tokenized
separately — Russian and English texts of similar length do NOT have similar
token counts, so one array per language is the only honest option. A single
"tokens: N" would be a lie in whichever language it did not belong to.

One token is not always a valid standalone string: cl100k_base is byte-level
BPE, so a multi-byte Cyrillic character can straddle two tokens. Decoding
tokens one by one would corrupt the text, so each token is sliced out of the
decoded full string by character offset. The result is asserted to rejoin the
source.

Run:
    uv run --with tiktoken python3 tools/build_corpus.py
"""

import codecs
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "texts.json"
OUT = ROOT / "assets" / "corpus-tokens.js"

LANGS = ("ru", "en")


def split_into_token_strings(enc, tokens):
    """Per-token strings that concatenate back to the original text."""
    byte_chunks = [enc.decode_single_token_bytes(t) for t in tokens]
    full = b"".join(byte_chunks).decode("utf-8")

    decoder = codecs.getincrementaldecoder("utf-8")()
    offsets = [0]
    for chunk in byte_chunks:
        offsets.append(offsets[-1] + len(decoder.decode(chunk)))
    offsets[-1] += len(decoder.decode(b"", True))

    parts = [full[offsets[i]:offsets[i + 1]] for i in range(len(tokens))]
    assert "".join(parts) == full, "token strings do not rejoin to the source text"
    return parts


def main() -> int:
    try:
        import tiktoken
    except ImportError:
        print(
            "tiktoken is required: uv run --with tiktoken python3 tools/build_corpus.py",
            file=sys.stderr,
        )
        return 1

    src = json.loads(SRC.read_text(encoding="utf-8"))
    enc_name = src.get("encoding", "cl100k_base")
    enc = tiktoken.get_encoding(enc_name)

    rows = []
    for t in src["texts"]:
        variants = {}
        for lang in LANGS:
            text = t[f"text_{lang}"]
            ids = enc.encode(text)
            assert enc.decode(ids) == text, f"round-trip failed for {t['id']}/{lang}"
            variants[lang] = {
                "title": t[f"title_{lang}"],
                "tokens": split_into_token_strings(enc, ids),
            }
            print(f"{t['id']:10} {lang:3} {len(ids):5} tokens")
        rows.append({"id": t["id"], "variants": variants})

    total = sum(len(v["tokens"]) for r in rows for v in r["variants"].values())
    body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Source: tools/texts.json · Tokenizer: tiktoken cl100k_base · Regenerate:\n"
        "//   uv run --with tiktoken python3 tools/build_corpus.py\n"
        f"// Token arrays: {len(rows)} samples × {len(LANGS)} languages, {total} tokens in total\n\n"
        f"export const ENCODING = {json.dumps(enc_name)};\n"
        f"export const LANGS = {json.dumps(list(LANGS))};\n"
        f"export const TOTAL_TOKENS = {total};\n"
        f"export const RAW = {body};\n",
        encoding="utf-8",
    )
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes), {total} tokens total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())