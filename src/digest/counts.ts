import type { DigestNight } from './types.js';

export interface NightCounts {
  ok: number;
  retry: number;
  fail: number;
}

/** Counts of valid log lines by status. Bad lines are not counted. */
export function countNight(digest: DigestNight): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const r of digest.rows) {
    counts.ok += r.runs - r.retries - r.fails;
    counts.retry += r.retries;
    counts.fail += r.fails;
  }
  return counts;
}
