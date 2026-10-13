/**
 * live.js — measure a real endpoint from the browser.
 *
 * Everything here runs in the page: the key is sent by fetch() straight to the
 * URL you typed and is never uploaded anywhere else. That is also the hard part
 * — the endpoint must allow cross-origin requests from a github.io page.
 *
 * What is measured and how:
 *   TTFT      first non-empty content delta minus request start
 *   ITL       gaps between content deltas (p50 / p95 / max / stdev)
 *   t/s decode  tokens ÷ (last delta − first delta) — the steady-state number
 *   t/s total   tokens ÷ total wall clock — what a waiting user experiences
 *
 * `tokens` is the provider's own usage.completion_tokens when it is returned.
 * Providers that stream deltas without usage report one delta ≈ one token, and
 * that is usually true but not guaranteed — so the UI labels that case.
 */

const HINTS = [
  [/ollama/i, 'Ollama: start it with OLLAMA_ORIGINS="*" (or your github.io origin) to allow browser requests.'],
  [/localhost|127\.0\.0\.1|192\.168\.|10\./, 'Local endpoint: CORS still applies — allow this site’s origin in the server config.'],
  [/openai\.com/i, 'api.openai.com does allow browser requests with your own key; a failure here usually means the network blocked it.'],
];

export function corsHint(url) {
  for (const [re, hint] of HINTS) if (re.test(url)) return hint;
  return 'The endpoint did not answer the preflight. Either it has no CORS headers for this origin, or the network blocked it.';
}

function endpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function authHeaders(apiKey) {
  const h = { 'content-type': 'application/json' };
  if (apiKey) h.authorization = `Bearer ${apiKey}`;
  return h;
}

export async function listModels({ baseUrl, apiKey, signal }) {
  const r = await fetch(endpoint(baseUrl, '/models'), { headers: await authHeaders(apiKey), signal });
  if (!r.ok) throw new Error(`GET /models → HTTP ${r.status}`);
  const data = await r.json();
  return (data.data || []).map((m) => m.id).filter(Boolean).sort();
}

async function readError(r) {
  let detail = '';
  try {
    const text = await r.text();
    try {
      detail = JSON.parse(text).error?.message || text.slice(0, 400);
    } catch {
      detail = text.slice(0, 400);
    }
  } catch {
    /* body already consumed or unreadable */
  }
  return `HTTP ${r.status} ${r.statusText}${detail ? `\n${detail}` : ''}`;
}

/**
 * Stream a chat completion and time it.
 * @returns {Promise<object>} metrics
 */
export async function runLive(opts) {
  const {
    baseUrl, apiKey, model, prompt, maxTokens, signal,
    onDelta = () => {}, onFirst = () => {}, onReasoning = () => {},
  } = opts;

  const t0 = performance.now();
  let body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
  };
  if (Number(maxTokens) > 0) body.max_tokens = Number(maxTokens);

  const send = async (payload) => {
    let r;
    try {
      r = await fetch(endpoint(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: await authHeaders(apiKey),
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      const err = new Error(`Request failed: ${e.message}\n\n${corsHint(baseUrl)}`);
      err.friendly = true;
      throw err;
    }
    if (!r.ok) {
      let msg = await readError(r);
      // Newer reasoning models renamed the field; retry once before giving up.
      if (r.status === 400 && /max_tokens/i.test(msg) && 'max_tokens' in payload) {
        const retry = { ...payload };
        delete retry.max_tokens;
        retry.max_completion_tokens = Number(maxTokens) || 256;
        return send(retry);
      }
      const err = new Error(msg);
      err.httpStatus = r.status;
      throw err;
    }
    return r;
  };

  const r = await send(body);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();

  const deltas = [];        // content delta arrival times (ms)
  let reasoningChars = 0;
  let firstText = '';
  let usage = null;
  let finishReason = null;
  let buffer = '';

  const handleLine = (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let obj;
    try {
      obj = JSON.parse(payload);
    } catch {
      return; // keep-alive or provider-specific noise
    }
    if (obj.usage) usage = obj.usage;
    const choice = obj.choices && obj.choices[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || choice.message || {};
    const reasoning = delta.reasoning_content || delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) {
      reasoningChars += reasoning.length;
      onReasoning(reasoning);
    }
    const content = delta.content;
    if (typeof content === 'string' && content.length > 0) {
      deltas.push(performance.now());
      onDelta(content, deltas.length);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) handleLine(line.trim());
    }
  }
  buffer += decoder.decode();
  for (const line of buffer.split('\n')) handleLine(line.trim());

  const tEnd = performance.now();
  const firstDelta = deltas.length ? deltas[0] : 0;
  const lastDelta = deltas.length ? deltas[deltas.length - 1] : 0;

  const itls = [];
  for (let i = 1; i < deltas.length; i++) itls.push(deltas[i] - deltas[i - 1]);

  const reported = usage && Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null;
  const tokens = reported ?? deltas.length;
  const ttftMs = firstDelta ? firstDelta - t0 : null;
  const decodeSec = firstDelta && lastDelta > firstDelta ? (lastDelta - firstDelta) / 1000 : 0;
  const totalSec = (tEnd - t0) / 1000;

  return {
    ok: deltas.length > 0,
    model,
    baseUrl,
    at: new Date().toISOString(),
    chunks: deltas.length,
    tokens,
    tokensExact: reported !== null,
    chars: firstText.length,
    reasoningChars,
    promptTokens: usage && usage.prompt_tokens != null ? usage.prompt_tokens : null,
    ttftMs,
    totalSec,
    decodeSec,
    tpsDecode: decodeSec > 0 && tokens > 1 ? (tokens - 1) / decodeSec : 0,
    tpsTotal: totalSec > 0 ? tokens / totalSec : 0,
    itl: itls,
    finishReason,
  };
}