import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATOR = path.join(ROOT, 'scripts/generate-india-schedule.mjs');

describe('generate-india-schedule duplicate detection', () => {
  it('fails the build on conflicting duplicate HSN codes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tax-engine-sched-'));
    const schedules = path.join(tmp, 'schedules');
    const out = path.join(tmp, 'generated');
    fs.mkdirSync(path.join(schedules, 'hsn'), { recursive: true });
    fs.mkdirSync(path.join(schedules, 'sac'), { recursive: true });

    const period = {
      ratePercent: 18,
      taxability: 'TAXABLE',
      effectiveFrom: '2017-07-01',
      effectiveTo: null,
    };
    fs.writeFileSync(
      path.join(schedules, 'meta.json'),
      JSON.stringify({
        source: 'test',
        license: 'MIT',
        attribution: 'test',
        effectiveFrom: '2017-07-01',
        generatedAt: '2026-01-01T00:00:00.000Z',
        hsnCount: 2,
        sacCount: 0,
        hsnSkippedNoRate: 0,
        sacDefaultRatePercent: 18,
        chapters: ['01'],
      }),
    );
    fs.writeFileSync(
      path.join(schedules, 'hsn/ch-01.json'),
      JSON.stringify({
        chapter: '01',
        kind: 'HSN',
        count: 2,
        entries: [
          { code: '0101', rateHistory: [period] },
          { code: '0101', rateHistory: [{ ...period, ratePercent: 5 }] },
        ],
      }),
    );
    const result = spawnSync(process.execPath, [GENERATOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TAX_ENGINE_SCHEDULE_SOURCE: schedules,
        TAX_ENGINE_SCHEDULE_OUT: out,
      },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stderr}${result.stdout}`).toMatch(/Conflicting duplicate HSN 0101/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps a single record when duplicate HSN rows are identical', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tax-engine-sched-'));
    const schedules = path.join(tmp, 'schedules');
    const out = path.join(tmp, 'generated');
    fs.mkdirSync(path.join(schedules, 'hsn'), { recursive: true });
    fs.mkdirSync(path.join(schedules, 'sac'), { recursive: true });

    const period = {
      ratePercent: 18,
      taxability: 'TAXABLE',
      effectiveFrom: '2017-07-01',
      effectiveTo: null,
    };
    const entry = { code: '0101', rateHistory: [period] };
    fs.writeFileSync(
      path.join(schedules, 'meta.json'),
      JSON.stringify({
        source: 'test',
        license: 'MIT',
        attribution: 'test',
        effectiveFrom: '2017-07-01',
        generatedAt: '2026-01-01T00:00:00.000Z',
        hsnCount: 1,
        sacCount: 0,
        hsnSkippedNoRate: 0,
        sacDefaultRatePercent: 18,
        chapters: ['01'],
      }),
    );
    fs.writeFileSync(
      path.join(schedules, 'hsn/ch-01.json'),
      JSON.stringify({
        chapter: '01',
        kind: 'HSN',
        count: 2,
        entries: [entry, { ...entry }],
      }),
    );
    const result = spawnSync(process.execPath, [GENERATOR], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TAX_ENGINE_SCHEDULE_SOURCE: schedules,
        TAX_ENGINE_SCHEDULE_OUT: out,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/identicalDupesRemoved=1/);
    expect(result.stdout).toMatch(/records=1/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
