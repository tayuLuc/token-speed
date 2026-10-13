#!/usr/bin/env bun
/**
 * cdp.mjs — minimal CDP driver for verification runs.
 *
 * Why not agent-browser: ES modules cached by the page survive its reload, so
 * "I edited the file and reloaded" silently verifies the OLD build. Disabling
 * the HTTP cache through CDP is the difference between a green check and a
 * false one.
 *
 * Usage:
 *   bun tools/cdp.mjs <cdpPort> <url> [outPng]
 */
const port = process.argv[2] || '9466';
const url = process.argv[3];
const out = process.argv[4];

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    events.push(msg);
  }
};

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await new Promise((r) => { ws.onopen = r; });

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 2500));

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '') };
  return { value: r.result.value };
};

const problems = events
  .filter((e) => e.method === 'Runtime.exceptionThrown' || e.method === 'Log.entryAdded')
  .map((e) => JSON.stringify(e.params).slice(0, 400));

console.log(JSON.stringify({ url, eval: await evalJs(process.env.TS_EVAL || '1'), problems }, null, 1));

if (out) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await Bun.write(out, Buffer.from(shot.data, 'base64'));
  console.log('screenshot →', out);
}
ws.close();