/// Python runs here, off the main thread, so a long loop never freezes the page.
import type { FromWorker, RunRequest, ToWorker } from './types';
import { INPUT_MAX_BYTES } from './types';

interface PyProxyLike { toJs: (o?: unknown) => unknown; destroy: () => void }
interface PyodideLike {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => ((...a: unknown[]) => PyProxyLike) & { destroy?: () => void } };
  FS: { mkdir: (p: string) => void; mount: (fs: unknown, o: object, p: string) => void; filesystems: { IDBFS: unknown }; syncfs: (populate: boolean, cb: (e?: Error) => void) => void };
  setInterruptBuffer: (b: Uint8Array) => void;
  version: string;
}

const ctx = self as unknown as {
  postMessage: (m: FromWorker) => void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
  location: Location;
};
const post = (m: FromWorker) => ctx.postMessage(m);

let py: PyodideLike | null = null;
let runFn: ((...a: unknown[]) => PyProxyLike) | null = null;
let mount = '/work';
let interrupt: Uint8Array | null = null;
let inputInt: Int32Array | null = null;
let inputBytes: Uint8Array | null = null;
let currentId = 0;

function syncFs(populate: boolean): Promise<void> {
  return new Promise((resolve) => py!.FS.syncfs(populate, () => resolve()));
}

/** Blocks this worker until the page answers an input() request. Only possible with SharedArrayBuffer. */
function waitForInput(prompt: string): string | undefined {
  // Returns undefined (Python None) for end of input. JavaScript null would arrive in Python as `jsnull`, not None.
  if (!inputInt || !inputBytes) return undefined; // no live input: the program gets EOFError
  Atomics.store(inputInt, 0, 0);
  post({ type: 'input-request', id: currentId, prompt });
  Atomics.wait(inputInt, 0, 0);
  const state = Atomics.load(inputInt, 0);
  if (state === 2) return undefined;
  const n = Math.min(Atomics.load(inputInt, 1), INPUT_MAX_BYTES);
  const text = new TextDecoder().decode(inputBytes.slice(8, 8 + n));
  Atomics.store(inputInt, 0, 0);
  return text;
}

async function init(m: Extract<ToWorker, { type: 'init' }>) {
  try {
    post({ type: 'status', stage: 'downloading' });
    const base = new URL(m.baseUrl, ctx.location.href).href;
    const mod = (await import(/* @vite-ignore */ base + 'pyodide.mjs')) as { loadPyodide: (o: { indexURL: string }) => Promise<PyodideLike> };
    py = await mod.loadPyodide({ indexURL: base });
    post({ type: 'status', stage: 'starting' });
    const src = await (await fetch(base + 'runner.py')).text();
    py.runPython(src);
    runFn = py.globals.get('run');
    if (m.interruptBuf) {
      interrupt = new Uint8Array(m.interruptBuf);
      py.setInterruptBuffer(interrupt);
    }
    if (m.inputBuf) {
      inputInt = new Int32Array(m.inputBuf);
      inputBytes = new Uint8Array(m.inputBuf);
    }
    // The learner's files live on a virtual disk kept in this browser (IndexedDB), one per signed-in user.
    post({ type: 'status', stage: 'files' });
    mount = '/u-' + m.userKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    try {
      py.FS.mkdir(mount);
      py.FS.mount(py.FS.filesystems.IDBFS, {}, mount);
      await syncFs(true);
    } catch {
      /* IndexedDB unavailable (private mode): files still work for this session, they just are not kept */
    }
    (globalThis as unknown as { __tracepadInput: unknown }).__tracepadInput = waitForInput;
    if (interrupt) interrupt[0] = 0; // never start with a pending interrupt
    const version = String(py.runPython('import sys; sys.version.split()[0]'));
    post({ type: 'ready', python: version, pyodide: py.version, live: !!(inputInt && interrupt) });
  } catch (e) {
    post({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
  }
}

async function run(id: number, req: RunRequest) {
  currentId = id;
  if (!py || !runFn) return;
  if (interrupt) interrupt[0] = 0;
  const provider = inputInt ? (py.runPython('lambda prompt: __import__("js").__tracepadInput(prompt)') as unknown) : undefined;
  let proxy: PyProxyLike | null = null;
  try {
    proxy = runFn(req.code, req.stdin ?? '', !!req.trace, mount, provider, 1_000_000, 1500, req.prelude ?? '');
    const result = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as never;
    post({ type: 'result', id, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    post({
      type: 'result', id,
      result: { ok: false, exit_code: 1, stdout: '', stderr: msg, events: [['err', msg]], error: { type: 'EngineError', message: msg, line: null, col: null, frames: [], traceback: msg } },
    });
  } finally {
    proxy?.destroy();
    if (interrupt) interrupt[0] = 0;
    try { await syncFs(false); } catch { /* ignore */ }
  }
}

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') void init(m);
  else if (m.type === 'run') void run(m.id, m.req);
};
