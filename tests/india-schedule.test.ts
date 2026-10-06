import { describe, expect, it } from 'vitest';
import Tax, {
  IndiaTaxability,
  PricingMode,
  TaxEngineErrorCode,
} from '../src/index.js';
import {
  buildScheduleIndex,
  hsnLookupCandidates,
  resolveScheduleEntry,
  INDIA_STARTER_SCHEDULE_INDEX,
} from '../src/countries/IN/schedules/index.js';
import {
  INDIA_FULL_SCHEDULE_INDEX,
  INDIA_FULL_SCHEDULE_META,
} from '../src/countries/IN/schedules/full.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';

describe('India schedule index', () => {
  it('resolves starter codes via Map', () => {
    const entry = resolveScheduleEntry(
      '8471',
      'HSN',
      DATE,
      INDIA_STARTER_SCHEDULE_INDEX,
    );
    expect(entry?.ratePercent).toBe(18);
    expect(entry?.taxability).toBe(IndiaTaxability.TAXABLE);
  });

  it('falls back HSN parents for longer codes', () => {
    expect(hsnLookupCandidates('84713010')).toEqual(
      expect.arrayContaining(['84713010', '847130', '8471']),
    );
    const entry = resolveScheduleEntry(
      '84713010',
      'HSN',
      DATE,
      INDIA_STARTER_SCHEDULE_INDEX,
    );
    expect(entry?.code).toBe('8471');
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
});

describe('India full schedule (opt-in)', () => {
  it('loads substantial HSN + SAC coverage', () => {
    expect(INDIA_FULL_SCHEDULE_META.hsnCount).toBeGreaterThan(10000);
    expect(INDIA_FULL_SCHEDULE_META.sacCount).toBeGreaterThan(500);
  });

  it('calculates with full schedule for a 6-digit HSN', () => {
    const tax = new Tax('IN', {
      stateCodeSource: 'STATE',
      schedule: INDIA_FULL_SCHEDULE_INDEX,
    });
    const result = tax.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: '27AABCU9603R1Z2' },
      item: {
        type: 'PRODUCT',
        hsn: '847130',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      },
      calculationDate: DATE,
    });
    expect(result.country).toBe('IN');
    expect(result.taxes.some((t) => t.type === 'IGST')).toBe(true);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('still errors for unknown HSN on starter schedule', () => {
    const tax = new Tax('IN', { stateCodeSource: 'STATE' });
    expect(() =>
      tax.calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'KA', gstin: KA_GSTIN },
        item: {
          type: 'PRODUCT',
          hsn: '7208',
          amount: { amount: 1000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
        },
        calculationDate: DATE,
      }),
    ).toThrow(
      expect.objectContaining({ code: TaxEngineErrorCode.NO_RULE_FOUND }),
    );
  });
});
