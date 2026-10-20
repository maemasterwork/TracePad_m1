import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import { mergeRows, type Row } from './merge';

export type { Row } from './merge';
export interface StoredRow extends Row { rev?: number; updated_at?: string }
export interface SaveResult {
  applied: string[];
  conflicts: { key: string; stored: StoredRow }[];
  rejected: { key: string | null; reason: string }[];
}
export type Rpc = (items: Row[]) => Promise<SaveResult>;
export type Pull = () => Promise<StoredRow[]>;
export type SyncState = 'guest' | 'saved' | 'saving' | 'offline';

const BATCH = 200; // the server accepts at most 200 items per call
let defaultStore: UseStore | null = null;
const idb = () => (defaultStore ??= createStore('tracepad', 'progress'));

export interface ProgressStoreOptions {
  userKey: string; // 'guest' or the auth user id
  rpc?: Rpc; // absent for guests
  pull?: Pull;
  now?: () => number;
  store?: UseStore;
  retryMs?: number[]; // backoff schedule
  schedule?: (fn: () => void, ms: number) => unknown;
}

/** Local-first progress: every write lands on the device at once, then is sent to the server whenever it can be. */
export class ProgressStore {
  private state: SyncState;
  private listeners = new Set<() => void>();
  private flushing: Promise<void> | null = null;
  private attempt = 0;
  private timer: unknown = null;
  readonly userKey: string;
  rejected: { key: string | null; reason: string }[] = [];

  constructor(private o: ProgressStoreOptions) {
    this.userKey = o.userKey;
    this.state = o.rpc ? 'saved' : 'guest';
  }

  private get st() { return this.o.store ?? idb(); }
  private now() { return (this.o.now ?? Date.now)(); }
  private rowKey(k: string) { return `${this.userKey}|row|${k}`; }
  private outKey(k: string) { return `${this.userKey}|out|${k}`; }

  getState(): SyncState { return this.state; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private setState(s: SyncState) { if (s !== this.state) { this.state = s; this.listeners.forEach((l) => l()); } }

  async get(key: string): Promise<Row | undefined> { return get<Row>(this.rowKey(key), this.st); }

  async list(prefix = ''): Promise<Row[]> {
    const p = `${this.userKey}|row|${prefix}`;
    const all = await entries<string, Row>(this.st);
    return all.filter(([k]) => typeof k === 'string' && k.startsWith(p)).map(([, v]) => v);
  }

  async pendingCount(): Promise<number> {
    const p = `${this.userKey}|out|`;
    return (await entries<string, Row>(this.st)).filter(([k]) => typeof k === 'string' && k.startsWith(p)).length;
  }

  /** Save a row locally (applying the same merge rules as the server) and queue it for sending. */
  async save(key: string, data: Record<string, unknown>): Promise<Row> {
    const incoming: Row = { key, data, client_ts: this.now() };
    const { row } = mergeRows(await this.get(key), incoming);
    await set(this.rowKey(key), row, this.st);
    await set(this.outKey(key), row, this.st);
    if (this.o.rpc) {
      this.setState('saving');
      void this.flush();
    }
    return row;
  }

  /** Send everything waiting. Safe to call at any time; concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.o.rpc) return Promise.resolve();
    if (!this.flushing) this.flushing = this.doFlush().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async doFlush(): Promise<void> {
    const rpc = this.o.rpc!;
    const p = `${this.userKey}|out|`;
    for (;;) {
      const waiting = (await entries<string, Row>(this.st)).filter(([k]) => typeof k === 'string' && k.startsWith(p));
      if (!waiting.length) {
        this.attempt = 0;
        this.setState('saved');
        return;
      }
      const batch = waiting.slice(0, BATCH);
      this.setState('saving');
      let res: SaveResult;
      try {
        res = await rpc(batch.map(([, v]) => v));
      } catch {
        this.setState('offline');
        this.scheduleRetry();
        return;
      }
      const sent = new Map(batch.map(([, v]) => [v.key, v]));
      for (const key of res.applied) await this.clearIfUnchanged(key, sent.get(key));
      for (const c of res.conflicts) {
        // The server holds a newer write. Keep the server's version locally, merged with anything newer done here since.
        const local = await this.get(c.key);
        const merged = mergeRows(c.stored, local && local.client_ts > (sent.get(c.key)?.client_ts ?? 0) ? local : c.stored).row;
        await set(this.rowKey(c.key), merged, this.st);
        await this.clearIfUnchanged(c.key, sent.get(c.key));
      }
      for (const r of res.rejected) {
        this.rejected.push(r);
        if (r.key) await del(this.outKey(r.key), this.st); // retrying a rejected item can never succeed
      }
    }
  }

  private async clearIfUnchanged(key: string, sentRow: Row | undefined) {
    const cur = await get<Row>(this.outKey(key), this.st);
    if (cur && sentRow && cur.client_ts === sentRow.client_ts) await del(this.outKey(key), this.st);
  }

  private scheduleRetry() {
    const sched = this.o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const steps = this.o.retryMs ?? [2000, 5000, 15000, 30000, 60000];
    const ms = steps[Math.min(this.attempt++, steps.length - 1)];
    if (this.timer) return;
    this.timer = sched(() => { this.timer = null; void this.flush(); }, ms);
  }

  /** Fetch the server's rows and merge them into the local copy (newer wins, same rules as the server). */
  async pullAndMerge(): Promise<number> {
    if (!this.o.pull) return 0;
    let remote: StoredRow[];
    try { remote = await this.o.pull(); } catch { this.setState('offline'); return 0; }
    let changed = 0;
    for (const r of remote) {
      const local = await this.get(r.key);
      const { row } = mergeRows(local, { key: r.key, data: r.data, client_ts: r.client_ts });
      if (!local || JSON.stringify(local) !== JSON.stringify(row)) {
        await set(this.rowKey(r.key), row, this.st);
        changed++;
        // if the merge produced something the server does not have yet, queue it
        if (!r.data || JSON.stringify(row.data) !== JSON.stringify(r.data) || row.client_ts !== r.client_ts) await set(this.outKey(r.key), row, this.st);
      }
    }
    if (this.o.rpc && (await this.pendingCount()) > 0) void this.flush();
    return changed;
  }

  /** After signing in: move work done as a guest into this account (the server merges it with what is already there). */
  async adopt(fromUserKey = 'guest'): Promise<number> {
    if (fromUserKey === this.userKey) return 0;
    const p = `${fromUserKey}|row|`;
    const all = (await entries<string, Row>(this.st)).filter(([k]) => typeof k === 'string' && k.startsWith(p));
    for (const [k, row] of all) {
      const mine = await this.get(row.key);
      const { row: merged } = mergeRows(mine, row);
      await set(this.rowKey(row.key), merged, this.st);
      await set(this.outKey(row.key), merged, this.st);
      await del(k, this.st);
    }
    for (const [k] of (await entries<string, Row>(this.st)).filter(([k]) => typeof k === 'string' && k.startsWith(`${fromUserKey}|out|`))) await del(k, this.st);
    if (all.length && this.o.rpc) void this.flush();
    return all.length;
  }

  dispose() { if (this.timer) clearTimeout(this.timer as number); this.timer = null; }
}
