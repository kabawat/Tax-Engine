import { describe, expect, it } from 'vitest';
import Tax, {
  IndiaTaxHead,
  PricingMode,
  StateCodeSources,
  TaxEngineError,
  TaxEngineErrorCode,
} from '../src/index.js';
import { resolvePlaceOfSupply } from '../src/countries/IN/place-of-supply/index.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';
const MH_GSTIN = '27AABCU9603R1Z2';

function party(state: string, gstin: string) {
  return { state, gstin };
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

describe('India place of supply', () => {
  const tax = () => new Tax('IN', { stateCodeSource: StateCodeSources.STATE });

  it('explicit placeOfSupplyState wins over deliveryState', () => {
    const result = tax().calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('KA', KA_GSTIN),
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
        deliveryState: 'KA',
        placeOfSupplyState: 'MH',
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'MH', ruleId: 'goods.explicit-override' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
  });

  it('goods deliveryState ≠ buyer → IGST', () => {
    const result = tax().calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('KA', KA_GSTIN),
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
        deliveryState: 'MH',
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'MH', ruleId: 'goods.delivery-location' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
  });

  it('performance SAC 996511 → seller state', () => {
    const pos = resolvePlaceOfSupply({
      seller: {
        state: 'KA',
        gstRegistered: true,
        stateSource: StateCodeSources.STATE,
        gstin: KA_GSTIN,
      },
      buyer: {
        state: 'MH',
        gstRegistered: true,
        stateSource: StateCodeSources.STATE,
        gstin: MH_GSTIN,
      },
      item: {
        type: 'SERVICE',
        sac: '996511',
        amount: { amount: 1000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      },
    });
    expect(pos).toEqual({
      state: 'KA',
      kind: 'SERVICES',
      ruleId: 'services.performance-location',
    });

    const result = tax().calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('MH', MH_GSTIN),
      items: [{
        type: 'SERVICE',
        sac: '996511',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
  });

  it('immovable-property SAC without override → INVALID_INPUT', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: party('KA', KA_GSTIN),
          buyer: party('MH', MH_GSTIN),
          items: [{
            type: 'SERVICE',
            sac: '997211',
            amount: { amount: 10000, currency: 'INR' },
            quantity: 1,
            pricingMode: PricingMode.EXCLUSIVE,
          }],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('goods transport requires deliveryState', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: party('KA', KA_GSTIN),
          buyer: party('MH', MH_GSTIN),
          items: [{
            type: 'SERVICE',
            sac: '996711',
            amount: { amount: 10000, currency: 'INR' },
            quantity: 1,
            pricingMode: PricingMode.EXCLUSIVE,
          }],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );

    const result = tax().calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('KA', KA_GSTIN),
      items: [{
        type: 'SERVICE',
        sac: '996711',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
        deliveryState: 'MH',
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'MH', ruleId: 'services.goods-transport' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
  });

  it('OIDAR SAC → buyer state', () => {
    const pos = resolvePlaceOfSupply({
      seller: {
        state: 'KA',
        gstRegistered: true,
        stateSource: StateCodeSources.STATE,
        gstin: KA_GSTIN,
      },
      buyer: {
        state: 'MH',
        gstRegistered: true,
        stateSource: StateCodeSources.STATE,
        gstin: MH_GSTIN,
      },
      item: {
        type: 'SERVICE',
        sac: '998434',
        amount: { amount: 1000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      },
    });
    expect(pos.ruleId).toBe('services.oidar');
    expect(pos.state).toBe('MH');
  });
});
