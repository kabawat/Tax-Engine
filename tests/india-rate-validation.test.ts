import { describe, expect, it } from 'vitest';
import { IndiaTaxability, TaxEngineError, TaxEngineErrorCode, } from '../src/index.js';
import { buildScheduleIndex, resolveScheduleEntry, } from '../src/countries/IN/schedules/index.js';
import { INDIA_FULL_SCHEDULE_INDEX } from '../src/countries/IN/schedules/full.js';
import { assertResolvedIndiaRate, validateIndiaGstRate, } from '../src/countries/IN/validate-gst-rate.js';

const DATE = '2026-04-01';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable('expected throw');
  } catch (error) {
    expect(error).toBeInstanceOf(TaxEngineError);
    expect((error as TaxEngineError).code).toBe(code);
  }
}

describe('validateIndiaGstRate', () => {
  it('validates a known HSN at current date', () => {
    const resolved = validateIndiaGstRate({
      kind: 'HSN',
      code: '8471',
      calculationDate: DATE,
    });
    expect(resolved.ratePercent).toBe(18);
    expect(resolved.taxability).toBe(IndiaTaxability.TAXABLE);
  });

  it('validates a known SAC', () => {
    const resolved = validateIndiaGstRate({
      kind: 'SAC',
      code: '998314',
      calculationDate: DATE,
    });
    expect(resolved.ratePercent).toBe(18);
    expect(resolved.taxability).toBe(IndiaTaxability.TAXABLE);
  });

  it('rejects missing HSN/SAC', () => {
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '00000000',
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.NO_RULE_FOUND,
    );
  });

  it('rejects empty code and bad calculationDate', () => {
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '  ',
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '8471',
          calculationDate: '2026-13-01',
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('resolves historical and current rates on boundary dates', () => {
    const before = validateIndiaGstRate({
      kind: 'HSN',
      code: '01012100',
      calculationDate: '2025-09-21',
    });
    const after = validateIndiaGstRate({
      kind: 'HSN',
      code: '01012100',
      calculationDate: '2025-09-22',
    });
    expect(before.ratePercent).toBe(12);
    expect(after.ratePercent).toBe(5);
  });

  it('resolves taxability change across dates', () => {
    const before = validateIndiaGstRate({
      kind: 'HSN',
      code: '0202',
      calculationDate: '2017-11-14',
    });
    const after = validateIndiaGstRate({
      kind: 'HSN',
      code: '0202',
      calculationDate: '2017-11-15',
    });
    expect(before.taxability).toBe(IndiaTaxability.NIL_RATED);
    expect(before.ratePercent).toBe(0);
    expect(after.taxability).toBe(IndiaTaxability.TAXABLE);
    expect(after.ratePercent).toBe(5);
  });

  it('rejects rate before first effectiveFrom on a closed-only history', () => {
    const index = buildScheduleIndex([
      {
        code: '99990001',
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
    expect(resolveScheduleEntry('99990001', 'HSN', '2019-12-31', index)).toBeUndefined();
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '99990001',
          calculationDate: '2019-12-31',
          schedule: index,
        }),
      TaxEngineErrorCode.NO_RULE_FOUND,
    );
  });

  it('rejects rate after effectiveTo', () => {
    const index = buildScheduleIndex([
      {
        code: '99990002',
        kind: 'HSN',
        rateHistory: [
          {
            ratePercent: 18,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: '2020-12-31',
          },
        ],
      },
    ]);
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '99990002',
          calculationDate: '2021-01-01',
          schedule: index,
        }),
      TaxEngineErrorCode.NO_RULE_FOUND,
    );
  });

  it('rejects mismatched caller ratePercent', () => {
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '8471',
          calculationDate: DATE,
          ratePercent: 12,
        }),
      TaxEngineErrorCode.INVALID_TAX_RATE,
    );
  });

  it('rejects mismatched caller taxability', () => {
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '8471',
          calculationDate: DATE,
          taxability: IndiaTaxability.EXEMPT,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('accepts matching caller rate and taxability', () => {
    const resolved = validateIndiaGstRate({
      kind: 'HSN',
      code: '8471',
      calculationDate: DATE,
      ratePercent: 18,
      taxability: IndiaTaxability.TAXABLE,
    });
    expect(resolved.code).toBe('8471');
  });

  it('rejects invalid taxability/rate combination on resolved row', () => {
    expectCode(
      () =>
        assertResolvedIndiaRate({
          code: 'x',
          kind: 'HSN',
          ratePercent: 18,
          taxability: IndiaTaxability.EXEMPT,
          effectiveFrom: '2017-07-01',
          effectiveTo: null,
        }),
      TaxEngineErrorCode.INVALID_TAX_RATE,
    );
  });

  it('rejects unknown TAXABLE slab', () => {
    expectCode(
      () =>
        assertResolvedIndiaRate({
          code: 'x',
          kind: 'HSN',
          ratePercent: 7,
          taxability: IndiaTaxability.TAXABLE,
          effectiveFrom: '2017-07-01',
          effectiveTo: null,
        }),
      TaxEngineErrorCode.INVALID_TAX_RATE,
    );
  });

  it('rejects overlapping rateHistory via buildScheduleIndex', () => {
    expectCode(
      () =>
        buildScheduleIndex([
          {
            code: '99990003',
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
                effectiveFrom: '2020-06-01',
                effectiveTo: null,
              },
            ],
          },
        ]),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('keeps open-ended future dates selectable on full schedule', () => {
    const resolved = validateIndiaGstRate({
      kind: 'HSN',
      code: '8471',
      calculationDate: '2099-01-01',
      schedule: INDIA_FULL_SCHEDULE_INDEX,
    });
    expect(resolved.ratePercent).toBe(18);
    expect(resolved.effectiveTo).toBeNull();
  });
});
