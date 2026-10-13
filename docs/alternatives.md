# Alternatives checked on GitHub

**Finding, measured 2026-10-13:** no ready-made equivalent of this page exists on
GitHub. Five projects come close; all of them are simulators without a
measurement, and four of the five have zero stars.

The conclusion is a snapshot. Stars and last-push dates move; re-run the queries
below before repeating the search.

## Method

`gh search repos` (authorized, not anonymous — the anonymous budget is 60/hour
and an exhausted 403 reads as "nothing exists"):

```
token speed in:name,description
tokens per second in:name,description
llm speed in:name,description
tps llm in:name,description
```

Then `gh api repos/<repo>` for license, stars, `has_pages` and `pushed_at`, and
`gh api repos/<repo>/pages` for the live status.

## What exists

| Repository | ★ | Lang | License | Pages | Last push | Live URL |
|---|---:|---|---|---|---|---|
| jammyfu/TokenSpeedSimulator | 1 | TypeScript | none | no | 2026-10-12 | — |
| aaravchour/token-speed-visualiser | 0 | HTML | Apache-2.0 | yes | 2025-12-06 | [aaravchour.github.io/token-speed-visualiser](https://aaravchour.github.io/token-speed-visualiser/) (`status: built`) |
| daveschumaker/tokenflow | 0 | JavaScript | MIT | no | 2025-02-12 | — |
| nickmimic/llm-speed-simulator | 0 | HTML | none | yes | 2026-04-05 | [nickmimic.github.io/llm-speed-simulator](https://nickmimic.github.io/llm-speed-simulator/) |
| iylmwysst/llm-token-speed-simulation | 0 | HTML | none | yes | 2026-04-22 | — |

Closest by scope, `jammyfu/TokenSpeedSimulator`: Vite + TypeScript, five
languages, presets seeded from an Artificial Analysis median-output-tokens/s
snapshot dated 2026-10-12, an A/B race, source-URL fetch, 1–2000 tok/s. Strong
on breadth. It ships no measurement path, and Pages is not enabled.

## Why none of them displaced a build

1. **Simulation only.** None times a real endpoint. The slider sets a number;
   nothing reports TTFT, tok/s or ITL measured from a live stream.
2. **Same timer underneath.** The simulators stream pre-baked token arrays on a
   timer, which is exactly the defect measured in
   [`measure-baseline.md`](measure-baseline.md) — a page that reports a speed it
   does not run at.
3. **Hobby scale.** 0–1 stars, one unmaintained for eight months at the time of
   checking, two without a license.
4. **No single-file drop-in.** The closest build (Vite + TS) needs a build step;
   the single-file ones are 9–42 KB with no live measurement to compensate.

## What this repo does instead

Same simulation idea, three differences worth the fork:

- a scheduler that keeps the rate it promises, with the numbers published;
- a **Live** tab that measures any OpenAI-compatible endpoint from the browser —
  TTFT, tok/s decode, tok/s overall, inter-token gap mean/p50/p95;
- sample texts that are real `cl100k_base` token arrays, generated offline by
  [`tools/build_corpus.py`](../tools/build_corpus.py) and checked for staleness
  by CI.