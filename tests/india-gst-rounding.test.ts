import { describe, expect, it } from 'vitest';
import Tax, {
  DiscountMode,
  DiscountType,
  IndiaTaxability,
  IndiaTaxHead,
  PricingMode,
  StateCodeSources,
} from '../src/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1ZJ';
const MH_GSTIN = '27AABCU9603R1ZN';
const CH_GSTIN = '04AABCU9603R1ZV';

function tax() {
  return new Tax('IN', { stateCodeSource: StateCodeSources.STATE });
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    type: 'PRODUCT' as const,
    hsn: '8471',
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: PricingMode.EXCLUSIVE,
    ...overrides,
  };
}

describe('India GST inclusive/exclusive + roundingDifference', () => {
  it('exclusive CGST+SGST on round base → difference 0', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([900, 900]);
    expect(result.totalTax.amount).toBe(1800);
    expect(result.roundingDifference.amount).toBe(0);
    expect(result.finalAmount.amount).toBe(11800);
  });

  it('exclusive IGST', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [product()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
    expect(result.totalTax.amount).toBe(1800);
    expect(result.roundingDifference.amount).toBe(0);
  });

  it('exclusive CGST+SGST when combined total ≠ sum of heads', () => {
    // 1.03 * 18% = 0.1854 → 0.19; each 9% = 0.0927 → 0.09; diff = 0.01
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product({ amount: { amount: 1.03, currency: 'INR' } })],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.amount.amount)).toEqual([0.09, 0.09]);
    expect(result.totalTax.amount).toBe(0.19);
    expect(result.roundingDifference.amount).toBe(0.01);
    expect(result.finalAmount.amount).toBe(1.22);
  });

  it('does not adjust tax heads to absorb roundingDifference', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product({ amount: { amount: 1.03, currency: 'INR' } })],
      calculationDate: DATE,
    });
    const headSum = result.taxes.reduce((s, t) => s + t.amount.amount, 0);
    expect(headSum).toBe(0.18);
    expect(result.totalTax.amount).not.toBe(headSum);
  });

  it('UTGST same-state', () => {
    const result = tax().calculate({
      seller: { state: 'CH', gstin: CH_GSTIN },
      buyer: { state: 'CH', gstin: CH_GSTIN },
      items: [product()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.UTGST,
    ]);
    expect(result.roundingDifference.amount).toBe(0);
  });

  it('inclusive classic 11800 → 10000 + 1800', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product({
          amount: { amount: 11800, currency: 'INR' },
          pricingMode: PricingMode.INCLUSIVE,
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.taxableAmount.amount).toBe(10000);
    expect(result.totalTax.amount).toBe(1800);
    expect(result.finalAmount.amount).toBe(11800);
    expect(result.roundingDifference.amount).toBe(0);
  });

  it('inclusive paise-awkward gross keeps finalAmount = gross', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product({
          amount: { amount: 1.21, currency: 'INR' },
          pricingMode: PricingMode.INCLUSIVE,
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.finalAmount.amount).toBe(1.21);
    expect(
      result.taxableAmount.amount + result.totalTax.amount,
    ).toBeCloseTo(1.21, 2);
  });

  it('zero amount and exempt → roundingDifference 0', () => {
    const zero = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [product({ amount: { amount: 0, currency: 'INR' } })],
      calculationDate: DATE,
    });
    expect(zero.totalTax.amount).toBe(0);
    expect(zero.roundingDifference.amount).toBe(0);

    const exempt = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [product({ hsn: '4901' })],
      calculationDate: DATE,
    });
    expect(exempt.taxability).toBe(IndiaTaxability.EXEMPT);
    expect(exempt.taxes).toEqual([]);
    expect(exempt.roundingDifference.amount).toBe(0);
  });

  it('BEFORE_TAX discount on exclusive line', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product({
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
    expect(result.totalTax.amount).toBe(1620);
    expect(result.discount?.amount.amount).toBe(1000);
  });

  it('AFTER_TAX discount reduces finalAmount', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product({
          discount: {
            type: DiscountType.FIXED,
            value: 100,
            mode: DiscountMode.AFTER_TAX,
          },
        }),
      ],
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(1800);
    expect(result.finalAmount.amount).toBe(11700);
  });

  it('multi-line document roundingDifference from aggregates', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [
        product({ amount: { amount: 1.03, currency: 'INR' } }),
        product({ amount: { amount: 10000, currency: 'INR' } }),
      ],
      calculationDate: DATE,
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines![0]!.roundingDifference.amount).toBe(0.01);
    expect(result.lines![1]!.roundingDifference.amount).toBe(0);
    const headSum = result.taxes.reduce((s, t) => s + t.amount.amount, 0);
    expect(result.roundingDifference.amount).toBe(
      Number((result.totalTax.amount - headSum).toFixed(2)),
    );
  });

  it('RCM still returns tax heads with roundingDifference semantics', () => {
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
    expect(result.chargeMode).toBe('REVERSE_CHARGE');
    expect(result.taxes.length).toBeGreaterThan(0);
    expect(result.roundingDifference).toEqual({ amount: 0, currency: 'INR' });
  });
});
