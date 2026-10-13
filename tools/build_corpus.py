#!/usr/bin/env python3
"""
Regenerate assets/corpus-tokens.js from tools/texts.json.

Why the tokens are shipped instead of split in the browser: a demo about token
speed should emit REAL tokens. cl100k_base (the GPT-4 / o-series reference
tokenizer) is the closest widely-available reference, so the streams below are
exactly what a GPT-class tokenizer hands to the model, byte for byte.

One token is not always a valid standalone string: cl100k_base is byte-level
BPE, so a multi-byte Cyrillic character can straddle two tokens. Decoding tokens
one by one would corrupt the text, so each token is sliced out of the decoded
full string by character offset. The result is asserted to rejoin the source.

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
        ids = enc.encode(t["text"])
        assert enc.decode(ids) == t["text"], f"round-trip failed for {t['id']}"
        parts = split_into_token_strings(enc, ids)
        rows.append(
            {
                "id": t["id"],
                "lang": t["lang"],
                "titleRu": t["title_ru"],
                "titleEn": t["title_en"],
                "tokens": parts,
            }
        )
        print(f"{t['id']:10} {t['lang']:3} {len(ids):5} tokens")

    total = sum(len(r["tokens"]) for r in rows)
    body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Source: tools/texts.json · Tokenizer: tiktoken cl100k_base · Regenerate:\n"
        "//   uv run --with tiktoken python3 tools/build_corpus.py\n"
        f"// Tokens across all samples: {total}\n\n"
        f"export const ENCODING = {json.dumps(enc_name)};\n"
        f"export const TOTAL_TOKENS = {total};\n"
        f"export const RAW = {body};\n",
        encoding="utf-8",
    )
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes), {total} tokens total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())