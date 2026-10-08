import { describe, expect, it } from 'vitest';
import {
  DefaultTaxEngine,
  InMemoryTaxRuleRegistry,
  ItemType,
  PricingMode,
  RoundingMode,
  TaxEngineError,
  TaxEngineErrorCode,
  TaxRateBasis,
  validateTaxRule,
  validateTaxRules,
  type TaxRule,
} from '../src/index.js';
import { roundAmount } from '../src/money/operations.js';
import {
  indiaInterstateGstRules,
  indiaKarnatakaGstRules,
  indiaRules,
} from '../src/rules/india/index.js';
import { uaeRules } from '../src/rules/uae/index.js';

function percentRule(overrides: Partial<TaxRule> & Pick<TaxRule, 'id' | 'rate'>): TaxRule {
  return {
    name: overrides.name ?? overrides.id,
    taxType: overrides.taxType ?? 'VAT',
    category: overrides.category ?? 'GENERAL',
    jurisdiction: overrides.jurisdiction ?? { country: 'XX' },
    effective: overrides.effective ?? { effectiveFrom: '2020-01-01' },
    priority: overrides.priority ?? 1,
    compound: overrides.compound ?? { isCompound: false },
    taxableBase: overrides.taxableBase ?? {},
    applicability: overrides.applicability ?? { itemCategories: ['GENERAL'] },
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    amount: { amount: 100, currency: 'USD' },
    quantity: 1,
    item: { type: ItemType.PRODUCT, category: 'GENERAL' },
    pricingMode: PricingMode.EXCLUSIVE,
    jurisdiction: { country: 'XX' },
    calculationDate: '2025-06-01',
    ...overrides,
  };
}

function engineWith(rules: readonly TaxRule[], moneyConfig?: ConstructorParameters<typeof DefaultTaxEngine>[0]['moneyConfig']) {
  const registry = new InMemoryTaxRuleRegistry();
  registry.registerMany(rules);
  return new DefaultTaxEngine({ registry, moneyConfig });
}

describe('roundAmount', () => {
  it('rounds 1.005 HALF_UP to 1.01 without float artifacts', () => {
    expect(roundAmount(1.005, 2, RoundingMode.HALF_UP)).toBe(1.01);
  });

  it('honors DOWN and UP modes', () => {
    expect(roundAmount(1.019, 2, RoundingMode.DOWN)).toBe(1.01);
    expect(roundAmount(1.011, 2, RoundingMode.UP)).toBe(1.02);
  });
});

describe('exclusive and inclusive pricing', () => {
  const vat10 = percentRule({ id: 'vat-10', rate: { value: 10, basis: TaxRateBasis.PERCENTAGE } });

  it('calculates exclusive tax', () => {
    const result = engineWith([vat10]).calculate(baseInput());
    expect(result.taxableAmount.amount).toBe(100);
    expect(result.totalTax.amount).toBe(10);
    expect(result.finalAmount.amount).toBe(110);
  });

  it('calculates inclusive tax with rate-consistent lines', () => {
    const result = engineWith([vat10]).calculate(
      baseInput({ amount: { amount: 110, currency: 'USD' }, pricingMode: PricingMode.INCLUSIVE }),
    );
    expect(result.taxableAmount.amount).toBe(100);
    expect(result.taxes[0]?.taxAmount.amount).toBe(10);
    expect(result.finalAmount.amount).toBe(110);
    expect(result.finalAmount.amount).toBe(
      result.taxableAmount.amount + result.totalTax.amount,
    );
  });

  it('honors configured rounding mode for exclusive tax', () => {
    const result = engineWith([vat10], {
      defaultPrecision: 0,
      defaultRoundingMode: RoundingMode.DOWN,
    }).calculate(baseInput({ amount: { amount: 10.9, currency: 'USD' } }));
    expect(result.totalTax.amount).toBe(1);
  });

  it('rejects inclusive amounts that cannot cover fixed taxes', () => {
    const fixed = percentRule({
      id: 'fee',
      rate: { value: 5, basis: TaxRateBasis.FIXED },
    });
    expect(() =>
      engineWith([fixed]).calculate(
        baseInput({ amount: { amount: 1, currency: 'USD' }, pricingMode: PricingMode.INCLUSIVE }),
      ),
    ).toThrow(TaxEngineError);
  });

  it('rejects inclusive amounts with no rate-consistent base', () => {
    const dual = [
      percentRule({ id: 'a', rate: { value: 5, basis: TaxRateBasis.PERCENTAGE }, priority: 1 }),
      percentRule({ id: 'b', rate: { value: 5, basis: TaxRateBasis.PERCENTAGE }, priority: 2 }),
    ];
    expect(() =>
      engineWith(dual).calculate(
        baseInput({ amount: { amount: 10, currency: 'USD' }, pricingMode: PricingMode.INCLUSIVE }),
      ),
    ).toThrowError(/rate-consistent/);
  });
});

describe('multiple, compound, and fixed taxes', () => {
  it('applies multiple non-compound taxes on the same base', () => {
    const rules = [
      percentRule({ id: 'a', rate: { value: 9, basis: TaxRateBasis.PERCENTAGE }, priority: 1 }),
      percentRule({ id: 'b', rate: { value: 9, basis: TaxRateBasis.PERCENTAGE }, priority: 2 }),
    ];
    const result = engineWith(rules).calculate(baseInput({ amount: { amount: 1000, currency: 'USD' } }));
    expect(result.taxes.map((t) => t.taxAmount.amount)).toEqual([90, 90]);
    expect(result.finalAmount.amount).toBe(1180);
  });

  it('compounds when includePreviousTaxes is true', () => {
    const rules = [
      percentRule({ id: 'vat', rate: { value: 10, basis: TaxRateBasis.PERCENTAGE }, priority: 1 }),
      percentRule({
        id: 'cess',
        rate: { value: 10, basis: TaxRateBasis.PERCENTAGE },
        priority: 2,
        compound: { isCompound: true },
        taxableBase: { includePreviousTaxes: true },
      }),
    ];
    const result = engineWith(rules).calculate(baseInput());
    expect(result.taxes.map((t) => [t.ruleId, t.taxableBase.amount, t.taxAmount.amount])).toEqual([
      ['vat', 100, 10],
      ['cess', 110, 11],
    ]);
    expect(result.finalAmount.amount).toBe(121);
  });

  it('applies fixed taxes', () => {
    const rules = [
      percentRule({ id: 'vat', rate: { value: 10, basis: TaxRateBasis.PERCENTAGE }, priority: 1 }),
      percentRule({ id: 'fee', rate: { value: 5, basis: TaxRateBasis.FIXED }, priority: 2 }),
    ];
    const result = engineWith(rules).calculate(baseInput());
    expect(result.totalTax.amount).toBe(15);
    expect(result.finalAmount.amount).toBe(115);
  });
});

describe('exemptions, jurisdiction, dates, item types', () => {
  it('blocks rules via exemptionConfig and matching input exemptions', () => {
    const rule = percentRule({
      id: 'vat',
      rate: { value: 10, basis: TaxRateBasis.PERCENTAGE },
      exemptionConfig: { exemptCategories: ['GENERAL'] },
    });
    const result = engineWith([rule]).calculate(
      baseInput({ exemptions: [{ id: 'ex-1', applicableCategories: ['GENERAL'] }] }),
    );
    expect(result.taxes).toEqual([]);
    expect(result.finalAmount.amount).toBe(100);
  });

  it('orders by specificity, then priority, then id', () => {
    const rules = [
      percentRule({
        id: 'low-spec',
        rate: { value: 1, basis: TaxRateBasis.PERCENTAGE },
        jurisdiction: { country: 'ZZ' },
        priority: 1,
      }),
      percentRule({
        id: 'state-later',
        rate: { value: 2, basis: TaxRateBasis.PERCENTAGE },
        jurisdiction: { country: 'ZZ', state: 'ST' },
        priority: 5,
      }),
      percentRule({
        id: 'state-earlier',
        rate: { value: 3, basis: TaxRateBasis.PERCENTAGE },
        jurisdiction: { country: 'ZZ', state: 'ST' },
        priority: 5,
      }),
    ];
    const result = engineWith(rules).calculate(
      baseInput({ jurisdiction: { country: 'ZZ', state: 'ST' } }),
    );
    expect(result.taxes.map((t) => t.ruleId)).toEqual([
      'state-earlier',
      'state-later',
      'low-spec',
    ]);
  });

  it('respects effective dates', () => {
    const rule = percentRule({
      id: 'dated',
      rate: { value: 12, basis: TaxRateBasis.PERCENTAGE },
      effective: { effectiveFrom: '2023-01-01', effectiveUntil: '2023-12-31' },
      category: 'LEGACY',
      applicability: { itemCategories: ['LEGACY'] },
    });
    const engine = engineWith([rule]);
    expect(
      engine.calculate(
        baseInput({
          item: { type: ItemType.PRODUCT, category: 'LEGACY' },
          calculationDate: '2025-01-01',
        }),
      ).taxes,
    ).toEqual([]);
    expect(
      engine.calculate(
        baseInput({
          item: { type: ItemType.PRODUCT, category: 'LEGACY' },
          calculationDate: '2023-06-01',
        }),
      ).totalTax.amount,
    ).toBe(12);
  });

  it('distinguishes product and service applicability', () => {
    const productOnly = percentRule({
      id: 'product',
      rate: { value: 18, basis: TaxRateBasis.PERCENTAGE },
      applicability: { itemTypes: [ItemType.PRODUCT], itemCategories: ['GENERAL'] },
    });
    const engine = engineWith([productOnly]);
    expect(engine.calculate(baseInput()).totalTax.amount).toBe(18);
    expect(
      engine.calculate(baseInput({ item: { type: ItemType.SERVICE, category: 'GENERAL' } }))
        .taxes,
    ).toEqual([]);
  });
});

describe('validation and no-rule behavior', () => {
  it('rejects compound rules without includePreviousTaxes on register', () => {
    const registry = new InMemoryTaxRuleRegistry();
    expect(() =>
      registry.register(
        percentRule({
          id: 'bad',
          rate: { value: 10, basis: TaxRateBasis.PERCENTAGE },
          compound: { isCompound: true },
          taxableBase: {},
        }),
      ),
    ).toThrowError(/includePreviousTaxes/);
  });

  it('rejects empty tax type and category', () => {
    expect(() =>
      validateTaxRule(
        percentRule({
          id: 'bad',
          rate: { value: 1, basis: TaxRateBasis.PERCENTAGE },
          taxType: '   ',
          category: '',
        }),
      ),
    ).toThrow(TaxEngineError);
  });

  it('rejects duplicate ids in validateTaxRules', () => {
    const rule = percentRule({ id: 'dup', rate: { value: 1, basis: TaxRateBasis.PERCENTAGE } });
    expect(() => validateTaxRules([rule, rule])).toThrowError(/Duplicate/);
  });

  it('returns zero tax when no rules apply', () => {
    const result = engineWith([]).calculate(baseInput());
    expect(result.taxes).toEqual([]);
    expect(result.totalTax.amount).toBe(0);
    expect(result.finalAmount.amount).toBe(100);
  });

  it('preserves Error.cause', () => {
    const cause = new Error('root');
    const err = new TaxEngineError('wrap', {
      code: TaxEngineErrorCode.INVALID_TAX_INPUT,
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('is deterministic for identical inputs', () => {
    const engine = engineWith([
      percentRule({ id: 'a', rate: { value: 9, basis: TaxRateBasis.PERCENTAGE }, priority: 1 }),
      percentRule({ id: 'b', rate: { value: 9, basis: TaxRateBasis.PERCENTAGE }, priority: 2 }),
    ]);
    const input = baseInput({ amount: { amount: 99.99, currency: 'USD' } });
    expect(JSON.stringify(engine.calculate(input))).toBe(JSON.stringify(engine.calculate(input)));
  });
});

describe('India sample rules', () => {
  it('applies interstate product GST without stacking Karnataka rules', () => {
    const result = engineWith(indiaRules).calculate(
      baseInput({
        amount: { amount: 1000, currency: 'INR' },
        jurisdiction: { country: 'IN', state: 'KA' },
      }),
    );
    expect(result.taxes.map((t) => t.ruleId)).toEqual(['in-gst-product-standard']);
    expect(result.totalTax.amount).toBe(180);
  });

  it('applies Karnataka CGST+SGST when that subset is registered', () => {
    const result = engineWith(indiaKarnatakaGstRules).calculate(
      baseInput({
        amount: { amount: 1000, currency: 'INR' },
        jurisdiction: { country: 'IN', state: 'KA' },
      }),
    );
    expect(result.taxes.map((t) => t.ruleId)).toEqual(['in-ka-cgst', 'in-ka-sgst']);
    expect(result.totalTax.amount).toBe(180);
  });

  it('supports inclusive India interstate GST', () => {
    const result = engineWith(indiaInterstateGstRules).calculate(
      baseInput({
        amount: { amount: 1180, currency: 'INR' },
        pricingMode: PricingMode.INCLUSIVE,
        jurisdiction: { country: 'IN' },
      }),
    );
    expect(result.taxableAmount.amount).toBe(1000);
    expect(result.totalTax.amount).toBe(180);
    expect(result.finalAmount.amount).toBe(1180);
  });

  it('applies essential rate', () => {
    const result = engineWith(indiaRules).calculate(
      baseInput({
        amount: { amount: 1000, currency: 'INR' },
        item: { type: ItemType.PRODUCT, category: 'ESSENTIAL' },
        jurisdiction: { country: 'IN' },
      }),
    );
    expect(result.totalTax.amount).toBe(50);
  });
});

describe('UAE sample rules', () => {
  it('applies 5% VAT for product and service before future rate', () => {
    const engine = engineWith(uaeRules);
    expect(
      engine.calculate(
        baseInput({
          amount: { amount: 200, currency: 'AED' },
          item: { type: ItemType.SERVICE, category: 'CONSULTING' },
          jurisdiction: { country: 'AE' },
        }),
      ).totalTax.amount,
    ).toBe(10);
    expect(
      engine.calculate(
        baseInput({
          amount: { amount: 100, currency: 'AED' },
          jurisdiction: { country: 'AE' },
        }),
      ).totalTax.amount,
    ).toBe(5);
  });

  it('replaces standard rate with future rate after effectiveUntil', () => {
    const result = engineWith(uaeRules).calculate(
      baseInput({
        amount: { amount: 200, currency: 'AED' },
        item: { type: ItemType.SERVICE, category: 'CONSULTING' },
        jurisdiction: { country: 'AE' },
        calculationDate: '2027-06-01',
      }),
    );
    expect(result.taxes.map((t) => t.ruleId)).toEqual(['ae-vat-future']);
    expect(result.totalTax.amount).toBe(14);
  });

  it('applies zero-rated category', () => {
    const result = engineWith(uaeRules).calculate(
      baseInput({
        amount: { amount: 200, currency: 'AED' },
        item: { type: ItemType.PRODUCT, category: 'ZERO' },
        jurisdiction: { country: 'AE' },
      }),
    );
    expect(result.taxes).toHaveLength(1);
    expect(result.totalTax.amount).toBe(0);
  });
});
