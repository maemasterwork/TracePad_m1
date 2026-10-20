/** Merge rules for progress rows. They mirror public.save_progress on the server (see docs/database.md), so a row
 *  merged offline on the device and a row merged by the server end up the same. */
export interface Row { key: string; data: Record<string, unknown>; client_ts: number }

const isTrue = (v: unknown) => v === true;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Combine a stored row S with an incoming row I. `applied` is false when I is older than S and loses (default keys only). */
export function mergeRows(stored: Row | undefined, incoming: Row): { row: Row; applied: boolean } {
  if (!stored) return { row: incoming, applied: true };
  const incomingNewer = incoming.client_ts >= stored.client_ts; // ties go to the incoming write
  const newer = incomingNewer ? incoming : stored;
  const older = incomingNewer ? stored : incoming;
  const ts = Math.max(stored.client_ts, incoming.client_ts);

  if (incoming.key.startsWith('ex:')) {
    const data: Record<string, unknown> = { ...older.data, ...newer.data };
    data.pass = isTrue(stored.data.pass) || isTrue(incoming.data.pass);
    data.attempts = Math.max(num(stored.data.attempts), num(incoming.data.attempts));
    data.hints = Math.max(num(stored.data.hints), num(incoming.data.hints));
    return { row: { key: incoming.key, data, client_ts: ts }, applied: true };
  }
  if (incoming.key.startsWith('read:') || incoming.key.startsWith('bm:')) {
    const data: Record<string, unknown> = { ...older.data, ...newer.data };
    for (const k of new Set([...Object.keys(stored.data), ...Object.keys(incoming.data)])) {
      if (isTrue(stored.data[k]) || isTrue(incoming.data[k])) data[k] = true;
    }
    return { row: { key: incoming.key, data, client_ts: ts }, applied: true };
  }
  if (!incomingNewer) return { row: stored, applied: false };
  return { row: incoming, applied: true };
}
