import type { FromWorker, RunRequest, RunResult, ToWorker } from './types';
import { INPUT_MAX_BYTES } from './types';

export type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading'; stage: string }
  | { state: 'ready'; python: string; live: boolean }
  | { state: 'failed'; message: string };

export interface RunnerOptions {
  userKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  workerFactory?: () => Worker;
}

export type InputHandler = (prompt: string) => Promise<string | null>;

/**
 * Owns one Python worker. Runs are queued one at a time. A run that exceeds the time limit is interrupted
 * (KeyboardInterrupt) when the browser allows SharedArrayBuffer, and the worker is replaced if it does not stop.
 */
export class PyRunner {
  private worker: Worker | null = null;
  private readyP: Promise<void> | null = null;
  private status: EngineStatus = { state: 'idle' };
  private listeners = new Set<(s: EngineStatus) => void>();
  private interruptBuf?: SharedArrayBuffer;
  private inputBuf?: SharedArrayBuffer;
  private seq = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private pending = new Map<number, { resolve: (r: Omit<RunResult, 'ms'>) => void }>();
  private inputHandler: InputHandler | null = null;
  private stopRequested = false;
  private inFlight = false; // a run has been posted to the worker and has not finished
  readonly timeoutMs: number;

  constructor(private opts: RunnerOptions) {
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  getStatus(): EngineStatus { return this.status; }
  subscribe(fn: (s: EngineStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  setInputHandler(h: InputHandler | null): void { this.inputHandler = h; }
  /** True when input() can pause for the learner and the Stop button can interrupt a loop. */
  get live(): boolean { return this.status.state === 'ready' && this.status.live; }

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }

  private spawn(): Promise<void> {
    const sab = typeof SharedArrayBuffer !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated;
    if (sab) {
      this.interruptBuf = new SharedArrayBuffer(4);
      this.inputBuf = new SharedArrayBuffer(8 + INPUT_MAX_BYTES);
    } else {
      this.interruptBuf = undefined;
      this.inputBuf = undefined;
    }
    const w = this.opts.workerFactory ? this.opts.workerFactory() : new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker = w;
    this.setStatus({ state: 'loading', stage: 'downloading' });
    return new Promise<void>((resolve, reject) => {
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'status') this.setStatus({ state: 'loading', stage: m.stage });
        else if (m.type === 'ready') { this.setStatus({ state: 'ready', python: m.python, live: m.live }); resolve(); }
        else if (m.type === 'failed') { this.setStatus({ state: 'failed', message: m.message }); reject(new Error(m.message)); }
        else if (m.type === 'result') {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          p?.resolve(m.result);
        } else if (m.type === 'input-request') void this.answerInput(m.prompt);
      };
      w.onerror = (ev) => {
        const msg = ev.message || 'worker error';
        this.setStatus({ state: 'failed', message: msg });
        reject(new Error(msg));
      };
      const init: ToWorker = { type: 'init', baseUrl: this.opts.baseUrl ?? import.meta.env.BASE_URL + 'pyodide/', userKey: this.opts.userKey, interruptBuf: this.interruptBuf, inputBuf: this.inputBuf };
      w.postMessage(init);
    });
  }

  ensureReady(): Promise<void> {
    if (!this.readyP) {
      this.readyP = this.spawn();
      this.readyP.catch(() => { this.readyP = null; });
    }
    return this.readyP;
  }

  private async answerInput(prompt: string) {
    let text: string | null = null;
    try { text = this.inputHandler ? await this.inputHandler(prompt) : null; } catch { text = null; }
    if (!this.inputBuf) return;
    const ints = new Int32Array(this.inputBuf);
    if (text === null) {
      Atomics.store(ints, 0, 2);
    } else {
      const bytes = new TextEncoder().encode(text).slice(0, INPUT_MAX_BYTES);
      new Uint8Array(this.inputBuf).set(bytes, 8);
      Atomics.store(ints, 1, bytes.length);
      Atomics.store(ints, 0, 1);
    }
    Atomics.notify(ints, 0);
  }

  /** Ask the running program to stop. Works for loops when SharedArrayBuffer is available, otherwise replaces the worker. */
  interrupt(): void {
    this.stopRequested = true;
    // Before the run reaches the worker there is nothing to interrupt: runOne notices the flag once Python is ready.
    // (Signalling earlier would raise KeyboardInterrupt inside Python's own start-up code.)
    if (!this.inFlight) return;
    if (this.interruptBuf) {
      new Uint8Array(this.interruptBuf)[0] = 2; // SIGINT
      if (this.inputBuf) { const ints = new Int32Array(this.inputBuf); Atomics.store(ints, 0, 2); Atomics.notify(ints, 0); }
    } else {
      this.killWorker();
    }
  }

  private killWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.readyP = null;
    this.setStatus({ state: 'idle' });
    for (const [, p] of this.pending) {
      p.resolve({ ok: false, exit_code: 1, stdout: '', stderr: '', events: [['note', 'Stopped.']], error: { type: 'KeyboardInterrupt', message: 'Stopped.', line: null, col: null, frames: [], traceback: 'KeyboardInterrupt' } });
    }
    this.pending.clear();
  }

  run(req: RunRequest): Promise<RunResult> {
    const job = this.chain.then(() => this.runOne(req));
    this.chain = job.catch(() => undefined);
    return job;
  }

  private async runOne(req: RunRequest): Promise<RunResult> {
    this.stopRequested = false; // cleared before waiting, so a Stop pressed while Python is still loading is not lost
    await this.ensureReady();
    if (this.stopRequested) {
      return { ok: false, exit_code: 1, stdout: '', stderr: '', events: [], error: { type: 'KeyboardInterrupt', message: 'Stopped.', line: null, col: null, frames: [], traceback: 'KeyboardInterrupt' }, ms: 0, interrupted: true };
    }
    const id = ++this.seq;
    const t0 = performance.now();
    let timedOut = false;
    const done = new Promise<Omit<RunResult, 'ms'>>((resolve) => this.pending.set(id, { resolve }));
    const timer = setTimeout(() => {
      timedOut = true;
      this.interrupt();
      // If a tight loop ignores the interrupt for 2 s, replace the worker.
      setTimeout(() => { if (this.pending.has(id)) this.killWorker(); }, 2000);
    }, this.timeoutMs);
    this.inFlight = true;
    this.worker!.postMessage({ type: 'run', id, req } satisfies ToWorker);
    let r: Omit<RunResult, 'ms'>;
    try { r = await done; } finally { this.inFlight = false; clearTimeout(timer); }
    return { ...r, ms: Math.round(performance.now() - t0), timedOut, interrupted: this.stopRequested && !timedOut };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.readyP = null;
  }
}
