import { describe, expect, it } from 'vitest';
import Tax, {
  ChargeMode,
  DiscountMode,
  DiscountType,
  IndiaTaxability,
  IndiaTaxHead,
  LiabilityParty,
  PricingMode,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
  withIndiaCessHead,
  selectIndiaTaxHeads,
} from '../src/index.js';
import { assertResolvedIndiaRate } from '../src/countries/IN/validate-gst-rate.js';
import type { IndiaScheduleEntry } from '../src/countries/IN/schedules/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';
const MH_GSTIN = '27AABCU9603R1Z2';

const CESS_SCHEDULE: IndiaScheduleEntry[] = [
  {
    code: '8703',
    kind: 'HSN',
    rateHistory: [
      {
        ratePercent: 28,
        taxability: IndiaTaxability.TAXABLE,
        effectiveFrom: '2017-07-01',
        effectiveTo: null,
        cessRatePercent: 12,
      },
    ],
  },
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
    code: '8704',
    kind: 'HSN',
    rateHistory: [
      {
        ratePercent: 28,
        taxability: IndiaTaxability.TAXABLE,
        effectiveFrom: '2017-07-01',
        effectiveTo: null,
        cessRatePercent: 0,
      },
    ],
  },
  {
    code: '999799',
    kind: 'SAC',
    rateHistory: [
      {
        ratePercent: 18,
        taxability: IndiaTaxability.TAXABLE,
        effectiveFrom: '2017-07-01',
        effectiveTo: null,
        reverseCharge: true,
        cessRatePercent: 5,
      },
    ],
  },
];

function tax() {
  return new Tax('IN', {
    stateCodeSource: StateCodeSources.STATE,
    schedule: CESS_SCHEDULE,
  });
}

function product(hsn: string, overrides: Record<string, unknown> = {}) {
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

describe('India cess calculation', () => {
  it('withIndiaCessHead appends only when rate > 0', () => {
    const gst = selectIndiaTaxHeads({
      supplierState: 'KA',
      placeOfSupplyState: 'KA',
      totalRatePercent: 28,
    });
    expect(withIndiaCessHead(gst, undefined)).toEqual(gst);
    expect(withIndiaCessHead(gst, 0)).toEqual(gst);
    expect(withIndiaCessHead(gst, 12)).toEqual([
      ...gst,
      { type: IndiaTaxHead.CESS, ratePercent: 12 },
    ]);
  });

  it('exclusive intra-state: CGST+SGST+CESS', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8703')],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
      IndiaTaxHead.CESS,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([1400, 1400, 1200]);
    // gstTotal 2800 + cess 1200
    expect(result.totalTax.amount).toBe(4000);
    expect(result.roundingDifference.amount).toBe(0);
    expect(result.finalAmount.amount).toBe(14000);
  });

  it('exclusive inter-state: IGST+CESS', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [product('8703')],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.IGST,
      IndiaTaxHead.CESS,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([2800, 1200]);
    expect(result.totalTax.amount).toBe(4000);
  });

  it('inclusive GST+cess: finalAmount === gross', () => {
    // 10000 taxable + 2800 GST + 1200 cess = 14000 gross
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product('8703', {
          amount: { amount: 14000, currency: 'INR' },
          pricingMode: PricingMode.INCLUSIVE,
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.finalAmount.amount).toBe(14000);
    expect(result.taxableAmount.amount).toBe(10000);
    expect(result.totalTax.amount).toBe(4000);
    expect(result.taxes.find((t) => t.type === IndiaTaxHead.CESS)?.amount.amount).toBe(
      1200,
    );
  });

  it('cessRatePercent 0 omits CESS line', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8704')],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
    expect(result.totalTax.amount).toBe(2800);
  });

  it('omitted cessRatePercent → no CESS (8471 fixture)', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).not.toContain(IndiaTaxHead.CESS);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('roundingDifference from GST heads; cess not used to pad', () => {
    // 1.03 * 28% = 0.2884 → 0.29; each 14% = 0.1442 → 0.14; cess 12% = 0.1236 → 0.12
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8703', { amount: { amount: 1.03, currency: 'INR' } })],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([0.14, 0.14, 0.12]);
    expect(result.totalTax.amount).toBe(0.41); // 0.29 + 0.12
    expect(result.roundingDifference.amount).toBe(0.01);
  });

  it('BEFORE_TAX discount then GST+cess on reduced base', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product('8703', {
          discount: {
            type: DiscountType.FIXED,
            value: 1000,
            mode: DiscountMode.BEFORE_TAX,
          },
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.taxableAmount.amount).toBe(9000);
    expect(result.totalTax.amount).toBe(3600); // 2520 + 1080
    expect(result.taxes.find((t) => t.type === IndiaTaxHead.CESS)?.amount.amount).toBe(
      1080,
    );
  });

  it('AFTER_TAX discount reduces final after GST+cess', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product('8703', {
          discount: {
            type: DiscountType.FIXED,
            value: 500,
            mode: DiscountMode.AFTER_TAX,
          },
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(4000);
    expect(result.finalAmount.amount).toBe(13500);
  });

  it('multi-line merges CESS; document totals', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8703'), product('8471')],
      calculationDate: DATE,
    });
    expect(result.lines).toHaveLength(2);
    expect(result.totalTax.amount).toBe(5800); // 4000 + 1800
    const cess = result.taxes.find((t) => t.type === IndiaTaxHead.CESS);
    expect(cess?.amount.amount).toBe(1200);
  });

  it('RCM taxable + cess', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [
        {
          type: 'SERVICE',
          sac: '999799',
          amount: { amount: 10000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
        },
      ],
      calculationDate: DATE,
    });
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
    expect(result.liabilityParty).toBe(LiabilityParty.BUYER);
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.IGST,
      IndiaTaxHead.CESS,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([1800, 500]);
    expect(result.totalTax.amount).toBe(2300);
  });

  it('rejects cess on EXEMPT via assertResolvedIndiaRate', () => {
    expectCode(
      () =>
        assertResolvedIndiaRate({
          code: 'x',
          kind: 'HSN',
          ratePercent: 0,
          taxability: IndiaTaxability.EXEMPT,
          effectiveFrom: '2017-07-01',
          effectiveTo: null,
          cessRatePercent: 5,
        }),
      TaxEngineErrorCode.INVALID_TAX_RATE,
    );
  });

  it('unregistered seller → no GST and no cess', () => {
    const result = tax().calculate({
      seller: { state: 'KA' },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8703')],
      calculationDate: DATE,
    });
    expect(result.taxes).toEqual([]);
    expect(result.totalTax.amount).toBe(0);
  });
});
