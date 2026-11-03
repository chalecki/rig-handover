import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

let runsDir: string;

beforeEach(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
});

afterEach(async () => {
  await rm(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

function line(job: string, status: string, at: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ at, job, status, ...extra });
}

async function night(name: string, lines: string[]) {
  await writeFile(join(runsDir, `${name}.jsonl`), lines.join('\n') + (lines.length ? '\n' : ''));
}

// Deliberately not in job order in the file.
const GOOD = [
  line('charlie', 'ok', '2026-10-28T02:00:00+01:00', { owner: 'ann' }),
  line('alpha', 'fail', '2026-10-28T02:05:00+01:00', { owner: 'bob', error: 'boom' }),
  line('bravo', 'retry', '2026-10-28T02:10:00+01:00'),
  line('alpha', 'ok', '2026-10-28T02:15:00+01:00', { owner: 'bob' }),
];

describe('digest page', () => {
  it('200 for a good night, listing the jobs', async () => {
    await night('2026-10-28', GOOD);
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha', 'bravo', 'charlie']) expect(html).toContain(job);
  });

  it('404 when there is no file', async () => {
    const res = await app().request('/digest/2026-10-27');
    expect(res.status).toBe(404);
  });

  it('404 for a night that is not a date', async () => {
    await night('not-a-date', GOOD);
    const res = await app().request('/digest/not-a-date');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    await night('2026-10-26', []);
    const res = await app().request('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line, and shows the count', async () => {
    await night('2026-10-28', [...GOOD, 'this is not json']);
    const res = await app().request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha');
    expect(html).toMatch(/\b1\s+bad lines?\b|bad lines?\D{0,12}\b1\b/i);
  });

  it('says "no readable rows · N bad lines" for a file with only bad lines', async () => {
    await night('2026-10-25', ['nope', '{"at":"2026-10-25T01:00:00+01:00"}']);
    const res = await app().request('/digest/2026-10-25');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('no readable rows · 2 bad lines');
  });
});

describe('digest JSON', () => {
  it('200 for a good night, with rows sorted by job', async () => {
    await night('2026-10-28', GOOD);
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.night).toBe('2026-10-28');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('404 when there is no file', async () => {
    const res = await app().request('/api/digest/2026-10-27');
    expect(res.status).toBe(404);
  });

  it('404 for a night that is not a date', async () => {
    await night('not-a-date', GOOD);
    const res = await app().request('/api/digest/not-a-date');
    expect(res.status).toBe(404);
  });

  it('200 with rows [] for an empty night', async () => {
    await night('2026-10-26', []);
    const res = await app().request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
  });

  it('counts a bad line and still returns the rows', async () => {
    await night('2026-10-28', [...GOOD, 'this is not json']);
    const res = await app().request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(3);
  });

  it('a file with only bad lines gives rows [] and the count', async () => {
    await night('2026-10-25', ['nope', '{"at":"2026-10-25T01:00:00+01:00"}']);
    const res = await app().request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestNight;
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(2);
  });

  it('keeps a missing owner as null', async () => {
    await night('2026-10-28', GOOD);
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as DigestNight;
    expect(body.rows.find((r) => r.job === 'bravo')?.owner).toBeNull();
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    await night('2026-10-28', GOOD);
    const html = await (await app().request('/digest/2026-10-28')).text();
    const body = (await (await app().request('/api/digest/2026-10-28')).json()) as DigestNight;
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
