import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';

const CHROME = '/data/data/com.termux/files/usr/lib/chromium/chrome';
const SESSION = 'session-cd1f3fcc-ec1a-4b51-b7c1-840d9359bc18';
const PROFILE = '/data/data/com.termux/files/home/.cache/cdp-final-' + Date.now();

// dynamic free port
const port = await new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  srv.on('error', reject);
});

const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=' + port, '--user-data-dir=' + PROFILE, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(path) { const res = await fetch('http://127.0.0.1:' + port + path); return res.json(); }
async function waitForTarget() { for (let i = 0; i < 60; i++) { try { const l = await getJson('/json'); if (l.length) return l[0]; } catch {} await sleep(300); } throw new Error('no target'); }
let msgId = 0; const pending = new Map(); let ws;
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __evalError: String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200) };
  return r.result.value;
}
async function main() {
  const target = await waitForTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:3080/' });
  await sleep(8000);
  await evaluate(`localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: '${SESSION}' }));`);
  await send('Page.reload');
  let result = null;
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      const r = await evaluate(`(() => {
        const todo = document.querySelector('[data-testid="todo-panel"]');
        const chip = document.querySelector('[data-gitgraph-chip-anchor]');
        const textarea = document.querySelector('textarea');
        const card = textarea ? textarea.closest('[class$="_card"]') : null;
        if (!todo || !chip || !card) return null;
        const pick = (el) => { const r = el.getBoundingClientRect(); return { order: getComputedStyle(el).order, y: Math.round(r.y), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) }; };
        const t = pick(todo), c = pick(chip), m = pick(card);
        return {
          chip: c, todo: t, composer: m,
          okChipOnTop: c.y < t.y,
          okTodoAboveComposer: t.y + t.h <= m.y,
          okChipLeftAligned: Math.abs(c.x - m.x) <= 2,
          pass: c.y < t.y && t.y + t.h <= m.y
        };
      })()`);
      if (r && r.pass !== undefined) { result = r; break; }
    }
    if (!result && attempt < 2) { await send('Page.reload'); await sleep(6000); }
  }
  console.log('RESULT ' + JSON.stringify(result, null, 1));
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
