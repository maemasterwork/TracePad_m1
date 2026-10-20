/** Shapes shared by the worker, the client and the memory-model view. They mirror what runner.py returns. */
export type OutEvent = ['out' | 'err' | 'in' | 'note', string];

export interface RunError {
  type: string;
  message: string;
  line: number | null;
  col: number | null;
  frames: { line: number; name: string }[];
  traceback: string;
}

export type Val = { p: string; t: string } | { r: number } | { more: true };
export interface HeapObj {
  kind: 'list' | 'tuple' | 'set' | 'frozenset' | 'dict' | 'function' | 'class' | 'instance' | 'other';
  type: string;
  items?: Val[];
  pairs?: ({ k: Val; v: Val } | { more: true })[];
  attrs?: ({ name: string; v: Val } | { more: true })[];
  name?: string;
  repr?: string;
}
export interface Frame {
  name: string;
  line: number;
  vars: { name: string; v: Val }[];
}
export interface TraceStep {
  line: number;
  event: 'line' | 'return' | 'exception';
  depth: number;
  frames: Frame[];
  heap: Record<string, HeapObj>;
  gone: number[];
  returned?: string;
  exception?: string;
}

export interface RunResult {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  events: OutEvent[];
  error: RunError | null;
  steps?: TraceStep[];
  truncated?: boolean;
  /** Added by the client */
  ms: number;
  timedOut?: boolean;
  interrupted?: boolean;
}

export interface RunRequest {
  code: string;
  stdin?: string;
  trace?: boolean;
  prelude?: string;
}

export type ToWorker =
  | { type: 'init'; baseUrl: string; userKey: string; interruptBuf?: SharedArrayBuffer; inputBuf?: SharedArrayBuffer }
  | { type: 'run'; id: number; req: RunRequest };

export type FromWorker =
  | { type: 'status'; stage: 'downloading' | 'starting' | 'files' }
  | { type: 'ready'; python: string; pyodide: string; live: boolean }
  | { type: 'failed'; message: string }
  | { type: 'result'; id: number; result: Omit<RunResult, 'ms'> }
  | { type: 'input-request'; id: number; prompt: string };

/** Layout of the shared input buffer: Int32[0] = state (0 idle, 1 text ready, 2 end of input), Int32[1] = byte length, bytes from offset 8. */
export const INPUT_MAX_BYTES = 64 * 1024;
