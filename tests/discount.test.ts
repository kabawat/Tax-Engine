import { describe, expect, it } from 'vitest';
import Tax, {
  DiscountMode,
  DiscountType,
  IndiaTaxHead,
  PricingMode,
  resolveDiscountMode,
  TaxEngineError,
  TaxEngineErrorCode,
} from '../src/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1ZJ';

function baseInput(discount?: {
  type: 'FIXED' | 'PERCENTAGE';
  value: number;
  mode?: 'BEFORE_TAX' | 'AFTER_TAX';
}) {
  return {
    seller: { state: 'KA', gstin: KA_GSTIN },
    buyer: { state: 'KA', gstin: KA_GSTIN },
    items: [{
      type: 'PRODUCT' as const,
      hsn: '8471',
      amount: { amount: 100, currency: 'INR' },
      quantity: 1,
      pricingMode: PricingMode.EXCLUSIVE,
      ...(discount !== undefined ? { discount } : {}),
    }],
    calculationDate: DATE,
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

describe('discount mode resolution', () => {
  it('Case 1: both undefined → BEFORE_TAX', () => {
    expect(resolveDiscountMode(undefined, undefined)).toBe(DiscountMode.BEFORE_TAX);
    const result = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 10 }),
    );
    expect(result.discount?.mode).toBe(DiscountMode.BEFORE_TAX);
    expect(result.taxableAmount.amount).toBe(90);
    expect(result.totalTax.amount).toBe(16.2);
    expect(result.finalAmount.amount).toBe(106.2);
  });

  it('Case 2: config AFTER_TAX, discount mode undefined', () => {
    const result = new Tax('IN', {
      stateCodeSource: 'STATE',
      discountMode: DiscountMode.AFTER_TAX,
    }).calculate(baseInput({ type: DiscountType.FIXED, value: 8 }));
    expect(result.discount?.mode).toBe(DiscountMode.AFTER_TAX);
    expect(result.taxableAmount.amount).toBe(100);
    expect(result.totalTax.amount).toBe(18);
    expect(result.finalAmount.amount).toBe(110);
  });

  it('Case 3: config undefined, discount mode AFTER_TAX', () => {
    const result = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 8, mode: DiscountMode.AFTER_TAX }),
    );
    expect(result.discount?.mode).toBe(DiscountMode.AFTER_TAX);
    expect(result.finalAmount.amount).toBe(110);
  });

  it('Case 4: discount.mode overrides config', () => {
    const result = new Tax('IN', {
      stateCodeSource: 'STATE',
      discountMode: DiscountMode.AFTER_TAX,
    }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 10, mode: DiscountMode.BEFORE_TAX }),
    );
    expect(result.discount?.mode).toBe(DiscountMode.BEFORE_TAX);
    expect(result.taxableAmount.amount).toBe(90);
    expect(result.finalAmount.amount).toBe(106.2);
  });
});

describe('discount calculations', () => {
  it('fixed BEFORE_TAX and AFTER_TAX', () => {
    const before = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 10, mode: DiscountMode.BEFORE_TAX }),
    );
    expect(before.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.CGST, IndiaTaxHead.SGST]);
    expect(before.discount?.amount.amount).toBe(10);

    const after = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 10, mode: DiscountMode.AFTER_TAX }),
    );
    expect(after.taxableAmount.amount).toBe(100);
    expect(after.totalTax.amount).toBe(18);
    expect(after.finalAmount.amount).toBe(108);
  });

  it('percentage BEFORE_TAX and AFTER_TAX (gross base)', () => {
    const before = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.PERCENTAGE, value: 10, mode: DiscountMode.BEFORE_TAX }),
    );
    expect(before.taxableAmount.amount).toBe(90);
    expect(before.finalAmount.amount).toBe(106.2);

    const after = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.PERCENTAGE, value: 10, mode: DiscountMode.AFTER_TAX }),
    );
    // gross 118, 10% = 11.8, final 106.2
    expect(after.discount?.amount.amount).toBe(11.8);
    expect(after.finalAmount.amount).toBe(106.2);
  });

  it('inclusive pricing + discount', () => {
    const result = new Tax('IN', { stateCodeSource: 'STATE' }).calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 118, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.INCLUSIVE,
        discount: { type: DiscountType.FIXED, value: 10, mode: DiscountMode.BEFORE_TAX },
      }],
      calculationDate: DATE,
    });
    // extract taxable 100, discount 10 → taxable 90, tax 16.2, final 106.2
    expect(result.taxableAmount.amount).toBe(90);
    expect(result.finalAmount.amount).toBe(106.2);
  });

  it('IGST with AFTER_TAX discount', () => {
    const result = new Tax('IN', { stateCodeSource: 'STATE' }).calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: '27AABCU9603R1ZN' },
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 100, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
        discount: { type: DiscountType.FIXED, value: 8, mode: DiscountMode.AFTER_TAX },
      }],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
    expect(result.finalAmount.amount).toBe(110);
  });

  it('zero discount and no discount', () => {
    const zero = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
      baseInput({ type: DiscountType.FIXED, value: 0 }),
    );
    expect(zero.discount?.amount.amount).toBe(0);
    expect(zero.finalAmount.amount).toBe(118);

    const none = new Tax('IN', { stateCodeSource: 'STATE' }).calculate(baseInput());
    expect(none.discount).toBeUndefined();
    expect(none.finalAmount.amount).toBe(118);
  });

  it('rejects invalid discounts', () => {
    expectCode(
      () =>
        new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
          baseInput({ type: DiscountType.FIXED, value: -1 }),
        ),
      TaxEngineErrorCode.INVALID_INPUT,
    );
    expectCode(
      () =>
        new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
          baseInput({ type: DiscountType.PERCENTAGE, value: 150 }),
        ),
      TaxEngineErrorCode.INVALID_INPUT,
    );
    expectCode(
      () =>
        new Tax('IN', { stateCodeSource: 'STATE' }).calculate(
          baseInput({ type: DiscountType.FIXED, value: 200 }),
        ),
      TaxEngineErrorCode.INVALID_INPUT,
    );
    expectCode(
      () => new Tax('IN', { discountMode: 'SOMETIME' as 'AFTER_TAX' }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('works on UAE path', () => {
    const result = new Tax('AE', { discountMode: DiscountMode.AFTER_TAX }).calculate({
      amount: { amount: 100, currency: 'AED' },
      quantity: 1,
      item: { type: 'PRODUCT', category: 'GENERAL' },
      pricingMode: PricingMode.EXCLUSIVE,
      discount: { type: DiscountType.FIXED, value: 5 },
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(5);
    expect(result.finalAmount.amount).toBe(100);
    expect(result.discount?.mode).toBe(DiscountMode.AFTER_TAX);
  });
});
