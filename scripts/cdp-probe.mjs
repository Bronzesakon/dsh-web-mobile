// CDP regression probe for dsh-mobile-nav.
// Inputs (environment): DSH_PROBE_URL (default http://127.0.0.1:3080/),
// DSH_PROBE_SESSION_ID (required), DSH_PROBE_CHROME (default chromium),
// DSH_PROBE_TIMEOUT_MS (default 30000), DSH_PROBE_REQUIRE_CHIP (0 or 1, default 0).
// Exits 0 only when every required check passes; any FAIL, timeout, page error,
// or strict integration absence exits 1. Never calls process.exit().
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_URL = 'http://127.0.0.1:3080/';
const DEFAULT_TIMEOUT_MS = 30_000;
const CHROME_GRACE_MS = 5_000;
const CHIP_SELECTOR = '[data-gitgraph-chip-anchor] [data-gitgraph-chip]';

function readConfig(env = process.env) {
  const sessionId = env.DSH_PROBE_SESSION_ID?.trim();
  if (!sessionId) throw new Error('DSH_PROBE_SESSION_ID is required');

  const parsedUrl = new URL(env.DSH_PROBE_URL || DEFAULT_URL);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('DSH_PROBE_URL must use http or https');
  }

  const timeoutMs = Number(env.DSH_PROBE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('DSH_PROBE_TIMEOUT_MS must be a positive integer');
  }

  const requireChipFlag = env.DSH_PROBE_REQUIRE_CHIP || '0';
  if (requireChipFlag !== '0' && requireChipFlag !== '1') {
    throw new Error('DSH_PROBE_REQUIRE_CHIP must be 0 or 1');
  }

  return {
    url: parsedUrl.href,
    sessionId,
    chromePath: env.DSH_PROBE_CHROME || 'chromium',
    timeoutMs,
    requireChip: requireChipFlag === '1',
  };
}

const results = [];

class ProbeFailure extends Error {
  constructor(name, detail = '') {
    super(`${name}: ${detail || 'assertion failed'}`);
    this.name = 'ProbeFailure';
  }
}

class TimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

function record(status, name, detail = '') {
  results.push({ status, name, detail });
  console.log(`${status} ${name}${detail ? ` ${detail}` : ''}`);
}

const pass = (name, detail = '') => record('PASS', name, detail);
const skip = (name, detail = '') => record('SKIP', name, detail);
const fail = (name, detail = '') => record('FAIL', name, detail);

function assertCheck(name, condition, detail = '') {
  if (!condition) {
    fail(name, detail);
    throw new ProbeFailure(name, detail);
  }
  pass(name, detail);
}

function printSummary() {
  const count = (status) => results.filter((result) => result.status === status).length;
  console.log(`SUMMARY pass=${count('PASS')} skip=${count('SKIP')} fail=${count('FAIL')}`);
  return count('FAIL');
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(signal.reason || new Error('aborted'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitFor(label, timeoutMs, signal, probe) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await sleep(100, signal);
  }
  throw new TimeoutError(label, timeoutMs);
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function createCdpClient(ws, signal) {
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();

  const rejectPending = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
      return;
    }
    for (const handler of listeners.get(message.method) || []) handler(message.params);
  };
  ws.onerror = () => rejectPending(new Error('CDP WebSocket error'));
  ws.onclose = () => rejectPending(new Error('CDP WebSocket closed'));

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason || new Error('aborted'));
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };

  return {
    send,
    evaluate,
    on(method, handler) {
      const handlers = listeners.get(method) || [];
      handlers.push(handler);
      listeners.set(method, handlers);
    },
    close(error = new Error('CDP client closed')) {
      rejectPending(error);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}

async function main() {
  const abortController = new AbortController();
  const onSignal = (signalName) => abortController.abort(new Error(`received ${signalName}`));
  const onSigint = () => onSignal('SIGINT');
  const onSigterm = () => onSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  const signal = abortController.signal;

  let client = null;
  let chrome = null;
  let profileDir = null;
  let chromeFailure = null;
  let chromeExit = null;

  try {
    const config = readConfig();

    const port = await allocatePort();
    const cacheRoot = join(homedir(), '.cache');
    await mkdir(cacheRoot, { recursive: true });
    profileDir = await mkdtemp(join(cacheRoot, 'dsh-mobile-nav-probe-'));

    chrome = spawn(config.chromePath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profileDir,
      '--window-size=390,844',
      'about:blank',
    ], { stdio: 'ignore' });
    chrome.once('error', (error) => { chromeFailure = error; });
    chrome.once('exit', (code, signalCode) => { chromeExit = { code, signalCode }; });

    const target = await waitFor('chrome target', config.timeoutMs, signal, async () => {
      if (chromeFailure) throw new Error(`chromium launch failed: ${chromeFailure.message}`);
      if (chromeExit) throw new Error(`chromium exited early (code=${chromeExit.code}, signal=${chromeExit.signalCode})`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json`);
        if (!response.ok) return null;
        const targets = await response.json();
        return targets.length ? targets[0] : null;
      } catch {
        return null;
      }
    });

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const onAbort = () => {
        try { ws.close(); } catch { /* best effort */ }
        reject(signal.reason || new Error('aborted'));
      };
      if (signal.aborted) { onAbort(); return; }
      ws.onopen = () => { signal.removeEventListener('abort', onAbort); resolve(); };
      ws.onerror = () => { signal.removeEventListener('abort', onAbort); reject(new Error('CDP WebSocket connection failed')); };
      signal.addEventListener('abort', onAbort, { once: true });
    });

    client = createCdpClient(ws, signal);
    if (signal.aborted) {
      client.close(signal.reason || new Error('aborted'));
    } else {
      signal.addEventListener('abort', () => client.close(signal.reason || new Error('aborted')), { once: true });
    }

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.send('Page.navigate', { url: config.url });

    const waitForPageLoad = (label) => waitFor(label, config.timeoutMs, signal, async () => {
      try {
        const state = await client.evaluate(`({ ready: document.readyState === 'complete', href: location.href })`);
        return state.ready && state.href.startsWith(config.url) ? state : null;
      } catch {
        return null;
      }
    });

    await waitForPageLoad('page load');

    const currentSession = JSON.stringify({ sessionId: config.sessionId });
    await client.evaluate(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(currentSession)});`);
    await client.send('Page.reload');
    await waitForPageLoad('page reload');

    let chipFound = false;
    try {
      chipFound = await waitFor('chip presence', config.timeoutMs, signal, async () => {
        const present = await client.evaluate(`document.querySelector(${JSON.stringify(CHIP_SELECTOR)}) !== null`);
        return present || null;
      });
    } catch (error) {
      if (!(error instanceof TimeoutError)) throw error;
    }
    if (chipFound) {
      pass('chip.present', 'found=true');
    } else {
      skip('chip.present', 'reason=chip-not-present');
    }
  } catch (error) {
    if (!(error instanceof ProbeFailure)) {
      fail('fatal', error instanceof Error ? error.message : String(error));
    }
  } finally {
    try {
      if (client) client.close();
    } catch (error) {
      console.error('teardown: close client failed:', error.message);
    }
    try {
      if (chrome && !chromeFailure) {
        if (!chromeExit) {
          chrome.kill('SIGTERM');
          const exited = once(chrome, 'exit').catch(() => {});
          const grace = new Promise((resolve) => setTimeout(resolve, CHROME_GRACE_MS));
          await Promise.race([exited, grace]);
          if (!chromeExit) {
            chrome.kill('SIGKILL');
            await exited;
          }
        }
      }
    } catch (error) {
      console.error('teardown: stop chromium failed:', error.message);
    }
    try {
      if (profileDir) await rm(profileDir, { recursive: true, force: true });
    } catch (error) {
      console.error('teardown: remove profile failed:', error.message);
    }
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
  }
}

try {
  await main();
} catch (error) {
  if (!(error instanceof ProbeFailure)) {
    fail('fatal', error instanceof Error ? error.message : String(error));
  }
}
process.exitCode = printSummary() > 0 ? 1 : 0;
