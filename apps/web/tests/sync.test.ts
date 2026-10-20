import { beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'idb-keyval';
import { mergeRows, type Row } from '../src/sync/merge';
import { ProgressStore, type SaveResult } from '../src/sync/queue';

const row = (key: string, data: Record<string, unknown>, client_ts: number): Row => ({ key, data, client_ts });
let n = 0;
const freshStore = () => createStore(`t${++n}`, 'progress');

describe('mergeRows mirrors the server rules', () => {
  it('default keys: last writer wins; an older incoming write loses', () => {
    expect(mergeRows(row('quiz:1:q1', { c: 1 }, 100), row('quiz:1:q1', { c: 2 }, 200))).toEqual({ row: row('quiz:1:q1', { c: 2 }, 200), applied: true });
    const r = mergeRows(row('quiz:1:q1', { c: 1 }, 300), row('quiz:1:q1', { c: 2 }, 200));
    expect(r.applied).toBe(false);
    expect(r.row.data).toEqual({ c: 1 });
  });
  it('ties go to the incoming write', () => {
    expect(mergeRows(row('pred:1:p1', { a: 1 }, 5), row('pred:1:p1', { a: 2 }, 5)).row.data).toEqual({ a: 2 });
  });
  it('ex: keys merge field by field and never conflict', () => {
    const r = mergeRows(row('ex:1:e1', { pass: true, attempts: 3, hints: 2, code: 'old' }, 100), row('ex:1:e1', { pass: false, attempts: 1, hints: 0, code: 'new' }, 200));
    expect(r.applied).toBe(true);
    expect(r.row.data).toEqual({ pass: true, attempts: 3, hints: 2, code: 'new' });
    expect(r.row.client_ts).toBe(200);
  });
  it('read: and bm: keys never go back to false', () => {
    const r = mergeRows(row('read:3', { done: true }, 100), row('read:3', { done: false, at: 5 }, 200));
    expect(r.row.data).toEqual({ done: true, at: 5 });
  });
});

describe('ProgressStore', () => {
  let clock = 1000;
  beforeEach(() => { clock = 1000; });
  const opts = (extra: object = {}) => ({ userKey: 'u1', now: () => ++clock, store: freshStore(), retryMs: [10], schedule: () => 0, ...extra });

  it('guest: saves locally, never calls a server, state is guest', async () => {
    const s = new ProgressStore({ ...opts(), userKey: 'guest' });
    await s.save('read:1', { done: true });
    expect((await s.get('read:1'))!.data).toEqual({ done: true });
    expect(s.getState()).toBe('guest');
  });

  it('sends queued rows and clears the outbox when applied', async () => {
    const calls: Row[][] = [];
    const s = new ProgressStore({ ...opts(), rpc: async (items): Promise<SaveResult> => { calls.push(items); return { applied: items.map((i) => i.key), conflicts: [], rejected: [] }; } });
    await s.save('pred:1:p1', { right: true });
    await s.flush();
    expect(calls.flat().map((i) => i.key)).toEqual(['pred:1:p1']);
    expect(await s.pendingCount()).toBe(0);
    expect(s.getState()).toBe('saved');
  });

  it('offline: keeps work, reports offline, and delivers it later', async () => {
    let online = false;
    const s = new ProgressStore({ ...opts(), rpc: async (items) => { if (!online) throw new Error('network'); return { applied: items.map((i) => i.key), conflicts: [], rejected: [] }; } });
    await s.save('quiz:2:q1', { right: false });
    await s.flush();
    expect(s.getState()).toBe('offline');
    expect(await s.pendingCount()).toBe(1);
    online = true;
    await s.flush();
    expect(await s.pendingCount()).toBe(0);
    expect(s.getState()).toBe('saved');
  });

  it('conflict: adopts the server copy and clears the outbox', async () => {
    const stored = { key: 'quiz:1:q1', data: { choice: 3 }, client_ts: 9_999_999 };
    const s = new ProgressStore({ ...opts(), rpc: async (items) => ({ applied: [], conflicts: [{ key: items[0].key, stored }], rejected: [] }) });
    await s.save('quiz:1:q1', { choice: 1 });
    await s.flush();
    expect((await s.get('quiz:1:q1'))!.data).toEqual({ choice: 3 });
    expect(await s.pendingCount()).toBe(0);
  });

  it('rejected items are dropped from the outbox (retrying cannot help) and remembered', async () => {
    const s = new ProgressStore({ ...opts(), rpc: async (items) => ({ applied: [], conflicts: [], rejected: [{ key: items[0].key, reason: 'data too large' }] }) });
    await s.save('meta:prefs', { x: 1 });
    await s.flush();
    expect(await s.pendingCount()).toBe(0);
    expect(s.rejected[0].reason).toBe('data too large');
  });

  it('a write made while a send is in flight is not lost', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const s = new ProgressStore({ ...opts(), rpc: async (items) => { if (first) { first = false; await gate; } return { applied: items.map((i) => i.key), conflicts: [], rejected: [] }; } });
    await s.save('pred:1:p1', { v: 1 });
    const f = s.flush();
    await s.save('pred:1:p1', { v: 2 }); // newer write while the first send is waiting
    release();
    await f;
    await s.flush();
    expect(await s.pendingCount()).toBe(0);
    expect((await s.get('pred:1:p1'))!.data).toEqual({ v: 2 });
  });

  it('sends in batches of at most 200', async () => {
    const sizes: number[] = [];
    const s = new ProgressStore({ ...opts(), rpc: async (items) => { sizes.push(items.length); return { applied: items.map((i) => i.key), conflicts: [], rejected: [] }; } });
    for (let i = 0; i < 450; i++) await s.save(`pred:1:p${i}`, { i });
    await s.flush();
    await s.flush();
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200);
    expect(await s.pendingCount()).toBe(0);
  });

  it('adopt moves guest progress into the account and queues it', async () => {
    const store = freshStore();
    const guest = new ProgressStore({ userKey: 'guest', store, now: () => ++clock });
    await guest.save('read:1', { done: true });
    const sent: string[] = [];
    const user = new ProgressStore({ userKey: 'u9', store, now: () => ++clock, rpc: async (items) => { sent.push(...items.map((i) => i.key)); return { applied: items.map((i) => i.key), conflicts: [], rejected: [] }; } });
    expect(await user.adopt()).toBe(1);
    await user.flush();
    expect(sent).toEqual(['read:1']);
    expect(await guest.list()).toEqual([]);
    expect((await user.get('read:1'))!.data).toEqual({ done: true });
  });

  it('pullAndMerge keeps newer local work and queues it', async () => {
    const s = new ProgressStore({ ...opts(), rpc: async (items) => ({ applied: items.map((i) => i.key), conflicts: [], rejected: [] }), pull: async () => [{ key: 'pred:1:p1', data: { v: 'server' }, client_ts: 1 }, { key: 'pred:1:p2', data: { v: 'only-server' }, client_ts: 1 }] });
    await s.save('pred:1:p1', { v: 'local' }); // newer than server's ts 1
    await s.flush();
    await s.pullAndMerge();
    expect((await s.get('pred:1:p1'))!.data).toEqual({ v: 'local' });
    expect((await s.get('pred:1:p2'))!.data).toEqual({ v: 'only-server' });
  });
});
