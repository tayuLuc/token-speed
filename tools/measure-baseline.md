# Measured baseline

Every number the public page claims about itself is produced by the code in
`assets/player.js` and measured in a real browser, not asserted. This file is
the evidence.

**Environment.** Chromium 154.0.8037.97 (macOS, Apple Silicon), headful window
driven over CDP, page served from `http://127.0.0.1:8812`. Harness:
`tools/probe.js`, run in the page via
`import('/tools/probe.js').then(m => m.run())`, result read from
`window.__tsTest`.

**Workload.** Real `cl100k_base` tokens from the `mech` sample. The slice is
sized per rate so every measurement window is at least ~1.5 s — a 0.4 s window
at 150 tok/s is 60 samples and swings ±10 % on jitter alone.

## 1. The scheduler holds the requested rate

`Stream` at `ttftMs = 0`, `jitter = 0`, `stall = 0`:

| Target tok/s | Tokens | Wall clock | Achieved tok/s | Error |
|---:|---:|---:|---:|---:|
| 10 | 60 | 5.896 s | 10.03 | +0.27 % |
| 25 | 60 | 2.367 s | 25.11 | +0.42 % |
| 150 | 240 | 1.599 s | 151.01 | +0.67 % |
| 250 | 400 | 1.600 s | 252.01 | +0.80 % |

The small positive bias is the catch-up burst: a token that was due at 15.0 ms
lands at the next frame, and the achieved rate is always a hair above the target
because the last token is emitted a fraction early.

With jitter (`sigma = 0.3`, stall probability `0.06`) the mean is preserved:

| Target tok/s | Tokens | Achieved tok/s | Error |
|---:|---:|---:|---:|
| 25 | 60 | 26.22 | +4.89 % |
| 120 | 192 | 123.27 | +2.73 % |

TTFT: 500 ms requested, 516 ms measured.

### The bug this table caught

The first implementation of `nextInterval()` added stall time on top of the mean
interval without compensating for it. A stall adds `1 + U(0, 2.5)` intervals
with probability 0.06, i.e. ~13.5 % extra time, so the "realistic" switch made
the stream 13 % slower than the number on screen — a lie told by the feature
that exists to be truthful. The expected stall cost is now subtracted from the
base interval (`(1/tps) * (1 − stall * 1.25)`) before jitter is applied.

## 2. The naive implementation does not

`setInterval(1000 / tps)` with a 25 ms busy-wait inside each callback, sampled
for 3 s:

| Requested tok/s | Interval | Achieved tok/s | Median gap | Max gap |
|---:|---:|---:|---:|---:|
| 25 | 40 ms | 25.0 | 40.0 ms | 41.2 ms |
| 200 | 5 ms | **40.3** | 25.0 ms | 25.5 ms |

The second row is the point: at 200 tok/s the timer can never fire more often
than its own callback allows, so the demo reports 200 while streaming 40. At
25 tok/s the 40 ms interval is longer than the 25 ms callback, so it survives —
which is why the mistake stays hidden until someone turns the slider up.

Worth stating precisely, because the usual explanation is wrong: an *empty*
`setInterval(5)` does reach 200/s in this browser. The failure is not "browsers
clamp timers"; it is callback cost exceeding the interval.

## 3. Two claims that measurement killed

Both were written into an earlier draft and removed:

1. "`textContent += piece` (what the vsegpt page does) is slower than appending
   text nodes." Measured over the 368 tokens of the `feel` sample:
   `textContent +=` 0.6 ms total, `appendChild` 1.4 ms total. Wrong for a
   sample of this size.
2. "Chunk counts from the fallback splitter are close to real token counts."
   Measured against `cl100k_base`: 325 / 503 / 281 / 354 chunks versus
   368 / 574 / 352 / 185 real tokens — between −23 % and +91 %. The fallback
   output is therefore labelled "chunks" everywhere in the UI, and the committed
   corpus ships real tokenizer arrays instead of splitting in the browser.

## Reproducing

```bash
python3 -m http.server 8812 --bind 127.0.0.1    # from the repo root
# in the browser console on http://127.0.0.1:8812/
import('/tools/probe.js').then(m => m.run())
window.__tsTest
```

The probe sets `pass: true` only if every ungated run is within 8 % of target,
the jittered runs stay inside −10 %/+10 %, and the TTFT lands at or after the
requested delay.