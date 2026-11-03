import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Line = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function isAt(value: unknown): value is string {
  if (typeof value !== 'string' || !AT.test(value) || Number.isNaN(Date.parse(value))) return false;
  // Date.parse rolls 02-30 over to 03-02, so check the date survives the round trip.
  const date = value.slice(0, 10);
  return new Date(date).toISOString().slice(0, 10) === date;
}

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function parseLine(raw: string): Line | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { at, job, status, owner, error } = parsed as Record<string, unknown>;
  const name = text(job);
  if (!isAt(at) || name === null || !isStatus(status)) return null;
  return { at, job: name, status, owner: text(owner), error: text(error) };
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;

  const log = readLog(join(runsDir, `${night}.jsonl`));
  if (log === null) return null;

  let badLines = 0;
  const byJob = new Map<string, DigestRow>();

  for (const raw of log.split('\n')) {
    if (raw.trim() === '') continue;

    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }

    const row: DigestRow = byJob.get(line.job) ?? {
      job: line.job,
      owner: null,
      runs: 0,
      retries: 0,
      fails: 0,
      lastStatus: line.status,
      lastError: null,
      firstAt: line.at,
      lastAt: line.at,
    };

    row.owner = line.owner;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    if (line.status === 'fail') row.fails += 1;
    row.lastStatus = line.status;
    row.lastError = line.error ?? row.lastError;
    row.lastAt = line.at;
    byJob.set(line.job, row);
  }

  // Code-unit order, so the sort doesn't shift with the host's locale.
  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, badLines, rows };
};
