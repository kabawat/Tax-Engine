import { describe, expect, it } from 'vitest';
import Tax, {
  ChargeMode,
  IndiaTaxability,
  IndiaTaxHead,
  LiabilityParty,
  PricingMode,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
  type IndiaScheduleEntry,
} from '../src/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1ZJ';
const MH_GSTIN = '27AABCU9603R1ZN';
const CH_GSTIN = '04AABCU9603R1ZV';

const SCHEDULE: IndiaScheduleEntry[] = [
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
    code: '4901',
    kind: 'HSN',
    rateHistory: [
      {
        ratePercent: 0,
        taxability: IndiaTaxability.EXEMPT,
        effectiveFrom: '2017-07-01',
        effectiveTo: null,
      },
    ],
  },
];

function tax() {
  return new Tax('IN', {
    stateCodeSource: StateCodeSources.STATE,
    schedule: SCHEDULE,
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

describe('Caller reverseCharge tax breakdown', () => {
  it('RCM intra-state → CGST+SGST, BUYER liability', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
    expect(result.liabilityParty).toBe(LiabilityParty.BUYER);
    expect(result.details).toMatchObject({ reverseCharge: true });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
    expect(result.taxes.map((t) => t.rate)).toEqual([9, 9]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([900, 900]);
    expect(result.taxableAmount.amount).toBe(10000);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('RCM inter-state → IGST', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
    expect(result.taxes[0]!.rate).toBe(18);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('RCM with UTGST same-state UT', () => {
    const result = tax().calculate({
      seller: { state: 'CH', gstin: CH_GSTIN },
      buyer: { state: 'CH', gstin: CH_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.UTGST,
    ]);
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
  });

  it('RCM with cess', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [product('8703')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.IGST,
      IndiaTaxHead.CESS,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([2800, 1200]);
    expect(result.totalTax.amount).toBe(4000);
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
  });

  it('RCM does not mimic forward-charge liability', () => {
    const forward = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
    });
    const rcm = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(forward.chargeMode).toBe(ChargeMode.FORWARD_CHARGE);
    expect(forward.liabilityParty).toBe(LiabilityParty.SELLER);
    expect(rcm.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
    expect(rcm.liabilityParty).toBe(LiabilityParty.BUYER);
    expect(rcm.totalTax.amount).toBe(forward.totalTax.amount);
  });

  it('RCM roundingDifference same as forward math', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('8471', { amount: { amount: 1.03, currency: 'INR' } })],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([0.09, 0.09]);
    expect(result.totalTax.amount).toBe(0.19);
    expect(result.roundingDifference.amount).toBe(0.01);
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
  });

  it('RCM + exempt → empty taxes', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product('4901')],
      calculationDate: DATE,
      reverseCharge: true,
    });
    expect(result.taxability).toBe(IndiaTaxability.EXEMPT);
    expect(result.taxes).toEqual([]);
    expect(result.totalTax.amount).toBe(0);
  });

  it('item reverseCharge overrides document false', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [product('8471', { reverseCharge: true })],
      calculationDate: DATE,
      reverseCharge: false,
    });
    expect(result.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
  });

  it('RCM without buyer GSTIN is unsupported', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: { state: 'KA', gstin: KA_GSTIN },
          buyer: { state: 'KA' },
          items: [product('8471')],
          calculationDate: DATE,
          reverseCharge: true,
        }),
      TaxEngineErrorCode.UNSUPPORTED_CASE,
    );
  });
});
