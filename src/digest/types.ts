// The digest contract. The reader is `readNight`, a `ReadNight` exported from
// `src/digest/read-night.ts`.
//
// "First" and "latest" below mean position among the job's valid lines in the file.

export type DigestStatus = 'ok' | 'retry' | 'fail';

/** One job of one night. */
export interface DigestRow {
  job: string;
  /** Owner on the job's latest line. Missing or `null` there gives `null`; the row is kept. */
  owner: string | null;
  /** Valid lines of the job. Ok count is derived: `runs - retries - fails`. */
  runs: number;
  /** Valid lines of the job with status `retry`. */
  retries: number;
  /** Valid lines of the job with status `fail`. */
  fails: number;
  /** Status of the job's latest line. */
  lastStatus: DigestStatus;
  /** Latest error seen for the job, kept even if `lastStatus` is `ok`. `null` if it had none. */
  lastError: string | null;
  /** `at` of the job's first line: the log's text verbatim, with its offset. */
  firstAt: string;
  /** `at` of the job's latest line: the log's text verbatim, with its offset. */
  lastAt: string;
}

/** One night's digest. */
export interface DigestNight {
  /** The night asked for, `YYYY-MM-DD`. */
  night: string;
  /** Lines that are not JSON, or lack a valid `at`, `job` or `status`. Blank lines don't count. */
  badLines: number;
  /** One row per job, sorted by job. Empty if the night has no valid lines. */
  rows: DigestRow[];
}

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns `null` when there is no file, or when `night` is not
 * `YYYY-MM-DD`. Bad lines are counted, never thrown.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
