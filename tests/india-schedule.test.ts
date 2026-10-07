import { describe, expect, it } from 'vitest';
import Tax, {
  IndiaTaxability,
  PricingMode,
  TaxEngineError,
  TaxEngineErrorCode,
} from '../src/index.js';
import {
  assertRateHistoryIntegrity,
  buildScheduleIndex,
  hsnLookupCandidates,
  pickIndiaSchedule,
  resolveScheduleEntry,
  sacLookupCandidates,
  scheduleLookupKey,
} from '../src/countries/IN/schedules/index.js';
import {
  INDIA_FULL_SCHEDULE,
  INDIA_FULL_SCHEDULE_INDEX,
  INDIA_FULL_SCHEDULE_META,
} from '../src/countries/IN/schedules/full.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1ZJ';
const MH_GSTIN = '27AABCU9603R1ZN';

describe('India schedule index', () => {
  it('resolves codes from the full schedule via Map', () => {
    const entry = resolveScheduleEntry(
      '8471',
      'HSN',
      DATE,
      INDIA_FULL_SCHEDULE_INDEX,
    );
    expect(entry?.ratePercent).toBe(18);
    expect(entry?.taxability).toBe(IndiaTaxability.TAXABLE);
  });

  it('falls back HSN parents for longer codes on a custom index', () => {
    expect(hsnLookupCandidates('84713010')).toEqual(
      expect.arrayContaining(['84713010', '847130', '8471']),
    );
    const index = buildScheduleIndex([
      {
        code: '8471',
        kind: 'HSN',
        rateHistory: [
          {
            ratePercent: 18,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: null,
          },
        ],
      },
    ]);
    const entry = resolveScheduleEntry('84713010', 'HSN', DATE, index);
    expect(entry?.code).toBe('8471');
  });

  it('falls back SAC parents for longer codes on a custom index', () => {
    expect(sacLookupCandidates('99831410')).toEqual(
      expect.arrayContaining(['99831410', '998314', '9983']),
    );
    const index = buildScheduleIndex([
      {
        code: '9983',
        kind: 'SAC',
        rateHistory: [
          {
            ratePercent: 18,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: null,
          },
        ],
      },
    ]);
    const entry = resolveScheduleEntry('99831410', 'SAC', DATE, index);
    expect(entry?.code).toBe('9983');
  });

  it('builds index from custom entries', () => {
    const index = buildScheduleIndex([
      {
        code: '9999',
        kind: 'HSN',
        rateHistory: [
          {
            taxability: IndiaTaxability.TAXABLE,
            ratePercent: 12,
            effectiveFrom: '2017-07-01',
            effectiveTo: null,
          },
        ],
      },
    ]);
    expect(resolveScheduleEntry('9999', 'HSN', DATE, index)?.ratePercent).toBe(12);
  });

  it('picks rateHistory period by calculation date', () => {
    const index = buildScheduleIndex([
      {
        code: '01012100',
        kind: 'HSN',
        description: 'Pure-bred breeding animals',
        rateHistory: [
          {
            ratePercent: 12,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: '2025-09-21',
          },
          {
            ratePercent: 5,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2025-09-22',
            effectiveTo: null,
          },
        ],
      },
    ]);
    expect(resolveScheduleEntry('01012100', 'HSN', '2025-09-21', index)?.ratePercent).toBe(12);
    expect(resolveScheduleEntry('01012100', 'HSN', '2025-09-22', index)?.ratePercent).toBe(5);
  });

  it('does not inherit parent rate when child entry exists but date misses', () => {
    const index = buildScheduleIndex([
      {
        code: '8471',
        kind: 'HSN',
        rateHistory: [
          {
            ratePercent: 18,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: null,
          },
        ],
      },
      {
        code: '84713010',
        kind: 'HSN',
        rateHistory: [
          {
            ratePercent: 12,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2020-01-01',
            effectiveTo: '2020-12-31',
          },
        ],
      },
    ]);
    expect(resolveScheduleEntry('84713010', 'HSN', '2019-06-01', index)).toBeUndefined();
    expect(resolveScheduleEntry('84713010', 'HSN', '2020-06-01', index)?.ratePercent).toBe(12);
    expect(resolveScheduleEntry('84719999', 'HSN', '2019-06-01', index)?.ratePercent).toBe(18);
  });

  it('rejects overlapping or invalid rateHistory in buildScheduleIndex', () => {
    expect(() =>
      buildScheduleIndex([
        {
          code: '9999',
          kind: 'HSN',
          rateHistory: [
            {
              ratePercent: 12,
              taxability: IndiaTaxability.TAXABLE,
              effectiveFrom: '2017-07-01',
              effectiveTo: '2020-12-31',
            },
            {
              ratePercent: 18,
              taxability: IndiaTaxability.TAXABLE,
              effectiveFrom: '2020-12-01',
              effectiveTo: null,
            },
          ],
        },
      ]),
    ).toThrow(expect.objectContaining({ code: TaxEngineErrorCode.INVALID_INPUT }));

    expect(() =>
      assertRateHistoryIntegrity([
        {
          ratePercent: 12,
          taxability: IndiaTaxability.TAXABLE,
          effectiveFrom: '2020-01-01',
          effectiveTo: '2019-01-01',
        },
      ]),
    ).toThrow(expect.objectContaining({ code: TaxEngineErrorCode.INVALID_INPUT }));
  });
});

describe('pickIndiaSchedule', () => {
  it('selects HSN rules from the full schedule', () => {
    const subset = pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: ['8471', '1001'] });
    expect(subset.size).toBe(2);
    expect(subset.get(scheduleLookupKey('HSN', '8471'))?.rateHistory[0]?.ratePercent).toBe(18);
    expect(subset.get(scheduleLookupKey('HSN', '1001'))?.rateHistory[0]?.taxability).toBe(
      IndiaTaxability.NIL_RATED,
    );
    expect(subset.has(scheduleLookupKey('SAC', '998314'))).toBe(false);
  });

  it('selects SAC rules from the full schedule', () => {
    const subset = pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { sac: ['998314'] });
    expect(subset.size).toBe(1);
    expect(subset.get(scheduleLookupKey('SAC', '998314'))?.rateHistory[0]?.ratePercent).toBe(18);
  });

  it('selects mixed HSN + SAC without duplicating rule data', () => {
    const fullEntry = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '8471'));
    const subset = pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
      hsn: ['8471'],
      sac: ['998314'],
    });
    expect(subset.size).toBe(2);
    expect(subset.get(scheduleLookupKey('HSN', '8471'))).toBe(fullEntry);
  });

  it('fails fast on unknown HSN or SAC', () => {
    expect(() =>
      pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: ['00000000'] }),
    ).toThrow(
      expect.objectContaining({ code: TaxEngineErrorCode.NO_RULE_FOUND }),
    );
    expect(() =>
      pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { sac: ['000000'] }),
    ).toThrow(TaxEngineError);
  });

  it('returns full schedule when no filter is provided', () => {
    expect(pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX)).toBe(INDIA_FULL_SCHEDULE_INDEX);
    expect(pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {})).toBe(INDIA_FULL_SCHEDULE_INDEX);
  });

  it('returns an empty index for empty code lists', () => {
    const subset = pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: [], sac: [] });
    expect(subset.size).toBe(0);
  });

  it('supports different applications with different code sets', () => {
    const appA = new Tax('IN', {
      stateCodeSource: 'STATE',
      schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: ['8471'] }),
    });
    const appB = new Tax('IN', {
      stateCodeSource: 'STATE',
      schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: ['1001'] }),
    });

    const a = appA.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(a.totalTax.amount).toBe(1800);

    expect(() =>
      appA.calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'KA', gstin: KA_GSTIN },
        items: [{
          type: 'PRODUCT',
          hsn: '1001',
          amount: { amount: 1000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
        }],
        calculationDate: DATE,
      }),
    ).toThrow(expect.objectContaining({ code: TaxEngineErrorCode.NO_RULE_FOUND }));

    const b = appB.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [{
        type: 'PRODUCT',
        hsn: '1001',
        amount: { amount: 1000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(b.taxability).toBe(IndiaTaxability.NIL_RATED);
    expect(b.totalTax.amount).toBe(0);
  });
});

describe('India full schedule (default)', () => {
  it('loads substantial HSN + SAC coverage', () => {
    expect(INDIA_FULL_SCHEDULE_META.hsnCount).toBeGreaterThan(10000);
    expect(INDIA_FULL_SCHEDULE_META.sacCount).toBeGreaterThan(500);
  });

  it('new Tax("IN") uses the full schedule by default', () => {
    const tax = new Tax('IN', { stateCodeSource: 'STATE' });
    const result = tax.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [{
        type: 'PRODUCT',
        hsn: '7208',
        amount: { amount: 1000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.country).toBe('IN');
    expect(result.taxes.some((t) => t.type === 'IGST')).toBe(true);
    expect(result.totalTax.amount).toBeGreaterThan(0);
  });

  it('calculates with full schedule for a 6-digit HSN', () => {
    const tax = new Tax('IN', {
      stateCodeSource: 'STATE',
      schedule: INDIA_FULL_SCHEDULE_INDEX,
    });
    const result = tax.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [{
        type: 'PRODUCT',
        hsn: '847130',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.country).toBe('IN');
    expect(result.taxes.some((t) => t.type === 'IGST')).toBe(true);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('errors for unknown HSN on the full schedule', () => {
    const tax = new Tax('IN', { stateCodeSource: 'STATE' });
    expect(() =>
      tax.calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'KA', gstin: KA_GSTIN },
        items: [{
          type: 'PRODUCT',
          hsn: '99999999',
          amount: { amount: 1000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
        }],
        calculationDate: DATE,
      }),
    ).toThrow(
      expect.objectContaining({ code: TaxEngineErrorCode.NO_RULE_FOUND }),
    );
  });
});

describe('HSN dataset integrity', () => {
  it('has no duplicate codes and valid rate periods in full schedule', () => {
    expect(INDIA_FULL_SCHEDULE_META.hsnCount).toBe(12877);
    const seenCodes = new Set<string>();
    for (const entry of INDIA_FULL_SCHEDULE) {
      if (entry.kind !== 'HSN') continue;
      expect(seenCodes.has(entry.code)).toBe(false);
      seenCodes.add(entry.code);
      expect(() =>
        assertRateHistoryIntegrity(entry.rateHistory, {
          kind: entry.kind,
          code: entry.code,
        }),
      ).not.toThrow();
      for (const period of entry.rateHistory) {
        expect(period.ratePercent).toBeGreaterThanOrEqual(0);
      }
      // Lazy/full index keeps rateHistory sorted by effectiveFrom descending
      for (let i = 1; i < entry.rateHistory.length; i++) {
        expect(
          entry.rateHistory[i - 1]!.effectiveFrom >= entry.rateHistory[i]!.effectiveFrom,
        ).toBe(true);
      }
    }
  });

  it('resolves historical rate changes across effective dates', () => {
    const beforeChange = resolveScheduleEntry(
      '01012100',
      'HSN',
      '2025-09-21',
      INDIA_FULL_SCHEDULE_INDEX,
    );
    const afterChange = resolveScheduleEntry(
      '01012100',
      'HSN',
      '2025-09-22',
      INDIA_FULL_SCHEDULE_INDEX,
    );
    expect(beforeChange?.ratePercent).toBe(12);
    expect(afterChange?.ratePercent).toBe(5);
  });

  it('resolves taxability changes across effective dates', () => {
    const before = resolveScheduleEntry('0202', 'HSN', '2017-11-14', INDIA_FULL_SCHEDULE_INDEX);
    const after = resolveScheduleEntry('0202', 'HSN', '2017-11-15', INDIA_FULL_SCHEDULE_INDEX);
    expect(before?.taxability).toBe(IndiaTaxability.NIL_RATED);
    expect(before?.ratePercent).toBe(0);
    expect(after?.taxability).toBe(IndiaTaxability.TAXABLE);
    expect(after?.ratePercent).toBe(5);
  });

  it('keeps future open-ended rates selectable', () => {
    const farFuture = resolveScheduleEntry(
      '8471',
      'HSN',
      '2099-01-01',
      INDIA_FULL_SCHEDULE_INDEX,
    );
    expect(farFuture?.ratePercent).toBe(18);
    expect(farFuture?.effectiveTo).toBeNull();
  });
});
