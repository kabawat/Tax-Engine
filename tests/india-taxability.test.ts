import { describe, expect, it } from 'vitest';
import Tax, {
  DiscountMode,
  DiscountType,
  IndiaTaxability,
  IndiaTaxHead,
  PricingMode,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
  isNilExemptOrNonGst,
} from '../src/index.js';
import {
  assertResolvedIndiaRate,
  validateIndiaGstRate,
} from '../src/countries/IN/validate-gst-rate.js';
import type { IndiaScheduleEntry } from '../src/countries/IN/schedules/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';
const MH_GSTIN = '27AABCU9603R1Z2';

function tax(schedule?: readonly IndiaScheduleEntry[]) {
  return new Tax('IN', {
    stateCodeSource: StateCodeSources.STATE,
    ...(schedule !== undefined ? { schedule } : {}),
  });
}

function product(
  hsn: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'PRODUCT' as const,
    hsn,
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: PricingMode.EXCLUSIVE,
    ...overrides,
  };
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable('expected throw');
  } catch (error) {
    expect(error).toBeInstanceOf(TaxEngineError);
    expect((error as TaxEngineError).code).toBe(code);
  }
}

describe('India nil / exempt / non-GST taxability', () => {
  it('isNilExemptOrNonGst helper', () => {
    expect(isNilExemptOrNonGst(IndiaTaxability.NIL_RATED)).toBe(true);
    expect(isNilExemptOrNonGst(IndiaTaxability.EXEMPT)).toBe(true);
    expect(isNilExemptOrNonGst(IndiaTaxability.NON_GST)).toBe(true);
    expect(isNilExemptOrNonGst(IndiaTaxability.TAXABLE)).toBe(false);
    expect(isNilExemptOrNonGst(IndiaTaxability.ZERO_RATED)).toBe(false);
  });

  it.each([
    ['0101', IndiaTaxability.NIL_RATED],
    ['4901', IndiaTaxability.EXEMPT],
    ['2203', IndiaTaxability.NON_GST],
  ] as const)('%s → %s with empty taxes (intra)', (hsn, kind) => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product(hsn)],
      calculationDate: DATE,
    });
    expect(result.taxability).toBe(kind);
    expect(result.taxes).toEqual([]);
    expect(result.totalTax.amount).toBe(0);
    expect(result.roundingDifference.amount).toBe(0);
    expect(result.finalAmount.amount).toBe(10000);
  });

  it('nil / exempt / non-GST inter-state also emit no heads', () => {
    for (const hsn of ['0101', '4901', '2203'] as const) {
      const result = tax().calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'MH', gstin: MH_GSTIN },
        items: [product(hsn)],
        calculationDate: DATE,
      });
      expect(result.taxes).toEqual([]);
      expect(result.totalTax.amount).toBe(0);
    }
  });

  it('inclusive nil keeps finalAmount === gross', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product('0101', {
          amount: { amount: 1234.56, currency: 'INR' },
          pricingMode: PricingMode.INCLUSIVE,
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.taxability).toBe(IndiaTaxability.NIL_RATED);
    expect(result.finalAmount.amount).toBe(1234.56);
    expect(result.taxes).toEqual([]);
  });

  it('TAXABLE@0 emits zero-amount GST heads (not empty taxes)', () => {
    const schedule: IndiaScheduleEntry[] = [
      {
        code: '999901',
        kind: 'HSN',
        rateHistory: [
          {
            ratePercent: 0,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2017-07-01',
            effectiveTo: null,
          },
        ],
      },
    ];
    const result = tax(schedule).calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('999901')],
      calculationDate: DATE,
    });
    expect(result.taxability).toBe(IndiaTaxability.TAXABLE);
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([0, 0]);
    expect(result.totalTax.amount).toBe(0);
  });

  it('BEFORE_TAX and AFTER_TAX discounts on exempt line', () => {
    const before = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [
        product('4901', {
          discount: {
            type: DiscountType.FIXED,
            value: 1000,
            mode: DiscountMode.BEFORE_TAX,
          },
        }),
      ],
      calculationDate: DATE,
    });
    expect(before.taxability).toBe(IndiaTaxability.EXEMPT);
    expect(before.taxes).toEqual([]);
    expect(before.discount?.amount.amount).toBe(1000);

    const after = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [
        product('4901', {
          discount: {
            type: DiscountType.FIXED,
            value: 500,
            mode: DiscountMode.AFTER_TAX,
          },
        }),
      ],
      calculationDate: DATE,
    });
    expect(after.finalAmount.amount).toBe(9500);
    expect(after.taxes).toEqual([]);
  });

  it('multi-line MIXED taxability', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471'), product('0101')],
      calculationDate: DATE,
    });
    expect(result.taxability).toBe('MIXED');
    expect(result.lines).toHaveLength(2);
    expect(result.lines![0]!.taxability).toBe(IndiaTaxability.TAXABLE);
    expect(result.lines![1]!.taxability).toBe(IndiaTaxability.NIL_RATED);
  });

  it('rejects cessRatePercent on non-TAXABLE rows', () => {
    expectCode(
      () =>
        assertResolvedIndiaRate({
          code: 'x',
          kind: 'HSN',
          ratePercent: 0,
          taxability: IndiaTaxability.EXEMPT,
          effectiveFrom: '2017-07-01',
          effectiveTo: null,
          cessRatePercent: 12,
        }),
      TaxEngineErrorCode.INVALID_TAX_RATE,
    );
  });

  it('validateIndiaGstRate rejects mismatched taxability', () => {
    expectCode(
      () =>
        validateIndiaGstRate({
          kind: 'HSN',
          code: '4901',
          calculationDate: DATE,
          taxability: IndiaTaxability.TAXABLE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('zero amount nil line', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [product('0101', { amount: { amount: 0, currency: 'INR' } })],
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(0);
    expect(result.taxes).toEqual([]);
  });
});
