import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const NIGHT = '2026-11-01';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-read-night-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function logOf(...lines: (object | string)[]) {
  const body = lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n');
  writeFileSync(join(dir, `${NIGHT}.jsonl`), `${body}\n`);
  return readNight(dir, NIGHT);
}

const line = (fields: object = {}) => ({
  at: '2026-11-01T23:00:00+01:00',
  job: 'a/job',
  status: 'ok',
  owner: 'rook',
  ...fields,
});

describe('readNight on the real night', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    expect(readNight('runs', '2026-10-28')).toEqual({
      night: '2026-10-28',
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          // The truncated line 16 names lane/sy..., 05:59:58. It belongs to no job.
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          fails: 0,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 1,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          fails: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });
});

describe('readNight: which file', () => {
  it('returns null when the file is missing', () => {
    expect(readNight(dir, NIGHT)).toBeNull();
  });

  it.each(['2026-1-1', '20261101', '2026-11-01.jsonl', '2026-11-01\n', 'latest', ''])(
    'returns null for night %j, even with a file of that name',
    (night) => {
      writeFileSync(join(dir, `${night}.jsonl`), `${JSON.stringify(line())}\n`);
      expect(readNight(dir, night)).toBeNull();
    },
  );

  it('does not follow a night out of the runs dir', () => {
    const runsDir = join(dir, 'runs');
    mkdirSync(runsDir);
    writeFileSync(join(dir, `${NIGHT}.jsonl`), `${JSON.stringify(line())}\n`);
    expect(readNight(runsDir, `../${NIGHT}`)).toBeNull();
  });

  it('throws read errors other than a missing file', () => {
    mkdirSync(join(dir, `${NIGHT}.jsonl`));
    expect(() => readNight(dir, NIGHT)).toThrow(/EISDIR/);
  });

  it('throws when the runs dir is not a directory', () => {
    const file = join(dir, 'not-a-dir');
    writeFileSync(file, '');
    expect(() => readNight(file, NIGHT)).toThrow(/ENOTDIR/);
  });

  it('gives an empty night for an empty file', () => {
    writeFileSync(join(dir, `${NIGHT}.jsonl`), '');
    expect(readNight(dir, NIGHT)).toEqual({ night: NIGHT, badLines: 0, rows: [] });
  });
});

describe('readNight: bad lines', () => {
  it.each([
    ['not JSON', '{"at":"2026-11-01T23:00:00+01:00","job":"a/j'],
    ['a JSON number', '42'],
    ['a JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"ok"'],
    ['no at', line({ at: undefined })],
    ['a numeric at', line({ at: 1793570400 })],
    ['an unparseable at', line({ at: 'last night' })],
    ['an at without an offset', line({ at: '2026-11-01T23:00:00' })],
    ['an impossible date in at', line({ at: '2026-02-30T23:00:00+01:00' })],
    ['an impossible hour in at', line({ at: '2026-11-01T25:00:00+01:00' })],
    ['no job', line({ job: undefined })],
    ['a null job', line({ job: null })],
    ['an empty job', line({ job: '' })],
    ['a numeric job', line({ job: 7 })],
    ['no status', line({ status: undefined })],
    ['an unknown status', line({ status: 'done' })],
    ['a status in the wrong case', line({ status: 'OK' })],
  ])('counts %s and attributes it to no job', (_name, bad) => {
    expect(logOf(line(), bad)).toMatchObject({
      badLines: 1,
      rows: [{ job: 'a/job', runs: 1, lastStatus: 'ok', lastAt: '2026-11-01T23:00:00+01:00' }],
    });
  });

  it('gives no rows for a night of only bad lines', () => {
    expect(logOf('nope', 'nope')).toEqual({ night: NIGHT, badLines: 2, rows: [] });
  });

  it('ignores blank lines and takes CRLF endings', () => {
    writeFileSync(
      join(dir, `${NIGHT}.jsonl`),
      `\n${JSON.stringify(line())}\r\n   \n\r\n\t\n${JSON.stringify(line())}\n\n`,
    );
    expect(readNight(dir, NIGHT)).toMatchObject({ badLines: 0, rows: [{ runs: 2 }] });
  });

  it('skips a bad line when picking the latest values', () => {
    const night = logOf(
      line({ at: '2026-11-01T23:00:00+01:00', status: 'retry', error: 'kept', owner: 'rook' }),
      line({ at: 'bad', status: 'fail', error: 'dropped', owner: 'dropped' }),
    );
    expect(night?.rows).toEqual([
      {
        job: 'a/job',
        owner: 'rook',
        runs: 1,
        retries: 1,
        fails: 0,
        lastStatus: 'retry',
        lastError: 'kept',
        firstAt: '2026-11-01T23:00:00+01:00',
        lastAt: '2026-11-01T23:00:00+01:00',
      },
    ]);
  });
});

describe('readNight: rows', () => {
  it('sorts rows by job, by code unit', () => {
    const night = logOf(line({ job: 'b' }), line({ job: 'a' }), line({ job: 'C' }), line({ job: 'a' }));
    expect(night?.rows.map((r) => [r.job, r.runs])).toEqual([
      ['C', 1],
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('keeps jobs named like Object.prototype members', () => {
    const night = logOf(line({ job: '__proto__' }), line({ job: 'constructor' }));
    expect(night?.rows.map((r) => r.job)).toEqual(['__proto__', 'constructor']);
  });

  it('counts retries and fails; ok is what is left', () => {
    const night = logOf(
      line({ status: 'ok' }),
      line({ status: 'retry' }),
      line({ status: 'retry' }),
      line({ status: 'fail' }),
      line({ status: 'ok' }),
    );
    expect(night?.rows[0]).toMatchObject({ runs: 5, retries: 2, fails: 1, lastStatus: 'ok' });
  });

  it('takes first and latest by file position, not by time, and keeps the text verbatim', () => {
    const night = logOf(
      line({ at: '2026-11-02T03:00:00+01:00', status: 'fail' }),
      line({ at: '2026-11-01T23:30:00.500-05:00', status: 'ok' }),
      line({ at: '2026-11-01T22:00:00Z', status: 'retry' }),
    );
    expect(night?.rows[0]).toMatchObject({
      firstAt: '2026-11-02T03:00:00+01:00',
      lastAt: '2026-11-01T22:00:00Z',
      lastStatus: 'retry',
    });
  });

  it.each([
    ['null', { owner: null }],
    ['missing', { owner: undefined }],
    ['not a string', { owner: 7 }],
  ])('gives owner null when the latest line has it %s, even after an earlier owner', (_n, owner) => {
    const night = logOf(line({ owner: 'rook' }), line(owner));
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]).toMatchObject({ owner: null, runs: 2 });
  });

  it('takes the owner from the latest line', () => {
    const night = logOf(line({ owner: null }), line({ owner: 'rook' }), line({ owner: 'lane-07' }));
    expect(night?.rows[0]?.owner).toBe('lane-07');
  });

  it('keeps the latest error after the job recovers', () => {
    const night = logOf(
      line({ status: 'retry', error: 'first' }),
      line({ status: 'retry', error: 'second' }),
      line({ status: 'ok' }),
      line({ status: 'ok', error: null }),
      line({ status: 'ok', error: '' }),
    );
    expect(night?.rows[0]).toMatchObject({ lastStatus: 'ok', lastError: 'second' });
  });

  it('gives lastError null for a job with no errors', () => {
    expect(logOf(line())?.rows[0]?.lastError).toBeNull();
  });
});
