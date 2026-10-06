import { describe, expect, it } from 'vitest';
import Tax, {
  ChargeMode,
  IndiaTaxHead,
  IndiaTaxability,
  LiabilityParty,
  PricingMode,
  resolveStateCodeFromGSTIN,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
} from '../src/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';
const MH_GSTIN = '27AABCU9603R1Z2';
const CH_GSTIN = '04AABCU9603R1Z2';

function productItem(overrides: Record<string, unknown> = {}) {
  return {
    type: 'PRODUCT' as const,
    hsn: '8471',
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: PricingMode.EXCLUSIVE,
    ...overrides,
  };
}

function serviceItem(overrides: Record<string, unknown> = {}) {
  return {
    type: 'SERVICE' as const,
    sac: '998314',
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

describe('Tax constructor', () => {
  it('constructs IN / AE / US', () => {
    expect(new Tax('IN').country).toBe('IN');
    expect(new Tax('AE').country).toBe('AE');
    expect(new Tax('US').country).toBe('US');
  });

  it('rejects unknown country at construction', () => {
    expectCode(() => new Tax('XYZ'), TaxEngineErrorCode.INVALID_COUNTRY);
  });

  it('keeps country immutable', () => {
    const tax = new Tax('IN');
    expect(() => {
      (tax as { country: string }).country = 'AE';
    }).toThrow();
  });

  it('isolates country engines', () => {
    const india = new Tax('IN', { stateCodeSource: 'STATE' }).calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(india.country).toBe('IN');
    expect(india.taxes.every((t) => ['CGST', 'SGST', 'UTGST', 'IGST'].includes(t.type))).toBe(
      true,
    );

    const uae = new Tax('AE').calculate({
      amount: { amount: 100, currency: 'AED' },
      quantity: 1,
      item: { type: 'PRODUCT', category: 'GENERAL' },
      pricingMode: PricingMode.EXCLUSIVE,
      calculationDate: DATE,
    });
    expect(uae.country).toBe('AE');
    expect(uae.taxes.some((t) => t.type === 'CGST' || t.type === 'IGST')).toBe(false);

    const us = new Tax('US').calculate({
      amount: { amount: 100, currency: 'USD' },
      quantity: 1,
      item: { type: 'PRODUCT', category: 'GENERAL' },
      pricingMode: PricingMode.EXCLUSIVE,
      jurisdiction: { state: 'CA' },
      calculationDate: DATE,
    });
    expect(us.country).toBe('US');
  });
});

describe('resolveStateCodeFromGSTIN', () => {
  it('resolves KA and MH', () => {
    expect(resolveStateCodeFromGSTIN(KA_GSTIN)).toBe('KA');
    expect(resolveStateCodeFromGSTIN(MH_GSTIN)).toBe('MH');
  });

  it('resolves LD (31) and LA (38)', () => {
    expect(resolveStateCodeFromGSTIN('31AABCU9603R1Z2')).toBe('LD');
    expect(resolveStateCodeFromGSTIN('38AABCU9603R1Z2')).toBe('LA');
  });

  it('rejects invalid format and unknown state digits', () => {
    expectCode(() => resolveStateCodeFromGSTIN('BAD'), TaxEngineErrorCode.INVALID_INPUT);
    expectCode(
      () => resolveStateCodeFromGSTIN('98AABCU9603R1Z2'),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });
});

describe('India GSTIN mode', () => {
  const tax = () => new Tax('IN', { stateCodeSource: StateCodeSources.GSTIN });

  it('same-state from GSTIN → CGST+SGST', () => {
    const result = tax().calculate({
      seller: { gstin: KA_GSTIN },
      buyer: { gstin: KA_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.CGST, IndiaTaxHead.SGST]);
    expect(result.totalTax.amount).toBe(1800);
    expect(result.details).toMatchObject({
      supplierState: 'KA',
      buyerState: 'KA',
      stateCodeSource: 'GSTIN',
      supplierStateSource: 'GSTIN',
      buyerStateSource: 'GSTIN',
    });
  });

  it('inter-state from GSTIN → IGST', () => {
    const result = tax().calculate({
      seller: { gstin: KA_GSTIN },
      buyer: { gstin: MH_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
    expect(result.details).toMatchObject({
      supplierState: 'KA',
      buyerState: 'MH',
    });
  });

  it('rejects GSTIN/state mismatch', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: { gstin: KA_GSTIN, state: 'MH' },
          buyer: { gstin: MH_GSTIN },
          items: [productItem()],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('allows unregistered party with state only', () => {
    const result = tax().calculate({
      seller: { state: 'KA' },
      buyer: { gstin: MH_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.taxes).toEqual([]);
    expect(result.liabilityParty).toBe(LiabilityParty.NONE);
    expect(result.details).toMatchObject({
      supplierStateSource: 'STATE',
      buyerStateSource: 'GSTIN',
    });
  });

  it('rejects missing gstin and state', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: {},
          buyer: { gstin: MH_GSTIN },
          items: [productItem()],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('treats GSTIN as registered', () => {
    const result = tax().calculate({
      seller: { gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.chargeMode).toBe(ChargeMode.FORWARD_CHARGE);
    expect(result.liabilityParty).toBe(LiabilityParty.SELLER);
    expect(result.totalTax.amount).toBe(1800);
  });
});

describe('India STATE mode', () => {
  const tax = () => new Tax('IN', { stateCodeSource: StateCodeSources.STATE });

  it('same-state PRODUCT matrix cells', () => {
    expect(
      tax().calculate({
        seller: { state: 'KA' },
        buyer: { state: 'KA' },
        items: [productItem()],
        calculationDate: DATE,
      }).taxes,
    ).toEqual([]);

    const registered = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA' },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(registered.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);

    expect(
      tax().calculate({
        seller: { state: 'KA' },
        buyer: { state: 'KA', gstin: KA_GSTIN },
        items: [productItem()],
        calculationDate: DATE,
      }).taxes,
    ).toEqual([]);

    const both = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(both.totalTax.amount).toBe(1800);
  });

  it('inter-state PRODUCT', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
  });

  it('SERVICE same and inter-state', () => {
    expect(
      tax().calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'KA', gstin: KA_GSTIN },
        items: [serviceItem()],
        calculationDate: DATE,
      }).taxes.map((t) => t.type),
    ).toEqual([IndiaTaxHead.CGST, IndiaTaxHead.SGST]);

    expect(
      tax().calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'MH', gstin: MH_GSTIN },
        items: [serviceItem()],
        calculationDate: DATE,
      }).taxes.map((t) => t.type),
    ).toEqual([IndiaTaxHead.IGST]);
  });

  it('rejects missing state', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: { gstin: KA_GSTIN },
          buyer: { state: 'MH' },
          items: [productItem()],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('rejects GSTIN/state mismatch', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: { state: 'KA', gstin: MH_GSTIN },
          buyer: { state: 'MH' },
          items: [productItem()],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('UTGST for Chandigarh', () => {
    const result = tax().calculate({
      seller: { state: 'CH', gstin: CH_GSTIN },
      buyer: { state: 'CH', gstin: CH_GSTIN },
      items: [productItem()],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.UTGST,
    ]);
  });

  it('inclusive pricing', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'KA', gstin: KA_GSTIN },
      items: [productItem({
        amount: { amount: 11800, currency: 'INR' },
        pricingMode: PricingMode.INCLUSIVE,
      })],
      calculationDate: DATE,
    });
    expect(result.taxableAmount.amount).toBe(10000);
    expect(result.totalTax.amount).toBe(1800);
  });

  it('taxability classifications and NO_RULE_FOUND', () => {
    expect(
      tax().calculate({
        seller: { state: 'KA', gstin: KA_GSTIN },
        buyer: { state: 'KA' },
        items: [productItem({ hsn: '4901' })],
        calculationDate: DATE,
      }).taxability,
    ).toBe(IndiaTaxability.EXEMPT);

    expectCode(
      () =>
        tax().calculate({
          seller: { state: 'KA', gstin: KA_GSTIN },
          buyer: { state: 'KA' },
          items: [productItem({ hsn: '999999' })],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.NO_RULE_FOUND,
    );
  });

  it('RCM and unsupported cases', () => {
    const rcm = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [serviceItem({ sac: '999799' })],
      calculationDate: DATE,
    });
    expect(rcm.chargeMode).toBe(ChargeMode.REVERSE_CHARGE);
    expect(rcm.liabilityParty).toBe(LiabilityParty.BUYER);

    expectCode(
      () =>
        tax().calculate({
          seller: { state: 'KA', gstin: KA_GSTIN },
          buyer: { state: 'MH' },
          items: [serviceItem({ sac: '999799' })],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.UNSUPPORTED_CASE,
    );
  });

  it('calculates multiple items with document totals and lines', () => {
    const result = tax().calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: MH_GSTIN },
      items: [
        productItem({ amount: { amount: 10000, currency: 'INR' } }),
        serviceItem({ amount: { amount: 2000, currency: 'INR' } }),
      ],
      calculationDate: DATE,
    });
    expect(result.lines).toHaveLength(2);
    expect(result.totalTax.amount).toBe(2160);
    expect(result.finalAmount.amount).toBe(14160);
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
    expect(result.taxes[0]?.amount.amount).toBe(2160);
  });
});

describe('UAE and US via Tax', () => {
  it('calculates UAE VAT', () => {
    const result = new Tax('AE').calculate({
      amount: { amount: 200, currency: 'AED' },
      quantity: 1,
      item: { type: 'SERVICE', category: 'CONSULTING' },
      pricingMode: PricingMode.EXCLUSIVE,
      calculationDate: '2025-06-01',
    });
    expect(result.totalTax.amount).toBe(10);
  });

  it('calculates US CA sales tax', () => {
    const result = new Tax('US').calculate({
      amount: { amount: 100, currency: 'USD' },
      quantity: 1,
      item: { type: 'PRODUCT', category: 'GENERAL' },
      pricingMode: PricingMode.EXCLUSIVE,
      jurisdiction: { state: 'CA' },
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(7.25);
  });
});
