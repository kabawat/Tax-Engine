import { describe, expect, it } from 'vitest';
import Tax, {
  IndiaTaxHead,
  PricingMode,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
  getStateFromGSTIN,
  isValidGSTIN,
  normalizeGstin,
  parseGSTIN,
  validateGSTIN,
} from '../src/index.js';

const KA_GSTIN = '29AABCU9603R1ZJ';
const MH_GSTIN = '27AABCU9603R1ZN';
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

describe('GSTIN validate / parse / state', () => {
  it('validateGSTIN accepts valid GSTIN and normalizes', () => {
    expect(validateGSTIN(`  ${KA_GSTIN.toLowerCase()}  `)).toBe(KA_GSTIN);
    expect(isValidGSTIN(KA_GSTIN)).toBe(true);
  });

  it('normalizeGstin trims and uppercases', () => {
    expect(normalizeGstin(' 29aabcu9603r1zj ')).toBe(KA_GSTIN);
  });

  it('parseGSTIN extracts state, PAN, entity fields', () => {
    const parsed = parseGSTIN(KA_GSTIN);
    expect(parsed).toMatchObject({
      gstin: KA_GSTIN,
      valid: true,
      stateCode: '29',
      state: 'KA',
      pan: 'AABCU9603R',
      entityCode: 'C',
      entityType: 'COMPANY',
      registrationNumber: '1',
      defaultChar: 'Z',
      checksum: 'J',
    });
  });

  it('getStateFromGSTIN', () => {
    expect(getStateFromGSTIN(KA_GSTIN)).toBe('KA');
    expect(getStateFromGSTIN(MH_GSTIN)).toBe('MH');
  });

  it('rejects missing / wrong length / bad characters', () => {
    expectCode(() => validateGSTIN(''), TaxEngineErrorCode.INVALID_INPUT);
    expectCode(() => validateGSTIN('29AABCU9603R1Z'), TaxEngineErrorCode.INVALID_INPUT);
    expectCode(() => validateGSTIN('29AABCU9603R1Z!'), TaxEngineErrorCode.INVALID_INPUT);
  });

  it('rejects invalid state code', () => {
    expectCode(() => validateGSTIN('98AABCU9603R1ZE'), TaxEngineErrorCode.INVALID_INPUT);
  });

  it('rejects invalid checksum', () => {
    expectCode(() => validateGSTIN('29AABCU9603R1Z2'), TaxEngineErrorCode.INVALID_INPUT);
    expect(isValidGSTIN('29AABCU9603R1Z2')).toBe(false);
  });

  it('known live-style GSTIN checksum (27AAACR5055K1Z7)', () => {
    expect(validateGSTIN('27AAACR5055K1Z7')).toBe('27AAACR5055K1Z7');
    expect(getStateFromGSTIN('27AAACR5055K1Z7')).toBe('MH');
  });
});

describe('GSTIN integration with Place of Supply', () => {
  it('GSTIN mode derives supplier/buyer state for heads', () => {
    const tax = new Tax('IN', { stateCodeSource: StateCodeSources.GSTIN });
    const result = tax.calculate({
      seller: { gstin: KA_GSTIN },
      buyer: { gstin: MH_GSTIN },
      items: [
        {
          type: 'PRODUCT',
          hsn: '8471',
          amount: { amount: 10000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
        },
      ],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      supplierState: 'KA',
      buyerState: 'MH',
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
  });

  it('explicit placeOfSupplyState is not overridden by GSTIN', () => {
    const tax = new Tax('IN', { stateCodeSource: StateCodeSources.GSTIN });
    const result = tax.calculate({
      seller: { gstin: KA_GSTIN },
      buyer: { gstin: MH_GSTIN },
      items: [
        {
          type: 'PRODUCT',
          hsn: '8471',
          amount: { amount: 10000, currency: 'INR' },
          quantity: 1,
          pricingMode: PricingMode.EXCLUSIVE,
          placeOfSupplyState: 'KA',
        },
      ],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
  });

  it('rejects GSTIN/state mismatch', () => {
    const tax = new Tax('IN', { stateCodeSource: StateCodeSources.STATE });
    expectCode(
      () =>
        tax.calculate({
          seller: { state: 'MH', gstin: KA_GSTIN },
          buyer: { state: 'MH', gstin: MH_GSTIN },
          items: [
            {
              type: 'PRODUCT',
              hsn: '8471',
              amount: { amount: 10000, currency: 'INR' },
              quantity: 1,
              pricingMode: PricingMode.EXCLUSIVE,
            },
          ],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });
});
