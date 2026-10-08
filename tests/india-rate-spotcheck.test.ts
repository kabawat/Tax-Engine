import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INDIA_FULL_SCHEDULE_INDEX } from '../src/countries/IN/schedules/full.js';
import { resolveScheduleEntry } from '../src/countries/IN/schedules/index.js';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/india-rate-spotcheck.json',
);

interface SpotcheckEntry {
  readonly kind: 'HSN' | 'SAC';
  readonly code: string;
  readonly ratePercent: number;
  readonly taxability: string;
  readonly reverseCharge?: boolean;
}

interface SpotcheckFixture {
  readonly calculationDate: string;
  readonly entries: readonly SpotcheckEntry[];
}

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as SpotcheckFixture;

describe('India rate spot-check fixture', () => {
  it('resolves every curated HSN/SAC expectation', () => {
    for (const row of fixture.entries) {
      const resolved = resolveScheduleEntry(
        row.code,
        row.kind,
        fixture.calculationDate,
        INDIA_FULL_SCHEDULE_INDEX,
      );
      expect(resolved, `${row.kind} ${row.code}`).toBeDefined();
      expect(resolved!.ratePercent, `${row.kind} ${row.code} rate`).toBe(row.ratePercent);
      expect(resolved!.taxability, `${row.kind} ${row.code} taxability`).toBe(row.taxability);
      if (row.reverseCharge === true) {
        expect(resolved!.reverseCharge).toBe(true);
      }
    }
  });
});
