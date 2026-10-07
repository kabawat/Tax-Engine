import { describe, expect, it } from 'vitest';
import Tax, { IndiaTaxHead, PricingMode, StateCodeSources, TaxEngineError, TaxEngineErrorCode, } from '../src/index.js';
import { createDefaultPlaceOfSupplyRules, matchServiceFamily, resolvePlaceOfSupply, } from '../src/countries/IN/place-of-supply/index.js';
import { DEFAULT_SERVICE_FAMILY_RULES } from '../src/countries/IN/place-of-supply/service-family-rules.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1ZJ';
const MH_GSTIN = '27AABCU9603R1ZN';

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

  it('passenger-transport SAC requires placeOfSupplyState', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: party('KA', KA_GSTIN),
          buyer: party('MH', MH_GSTIN),
          items: [{
            type: 'SERVICE',
            sac: '996411',
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
      buyer: party('MH', MH_GSTIN),
      items: [{
        type: 'SERVICE',
        sac: '996411',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
        placeOfSupplyState: 'TN',
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'TN', ruleId: 'services.explicit-override' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([IndiaTaxHead.IGST]);
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

  it('longest SAC prefix wins for family match', () => {
    const oidar = matchServiceFamily('998434');
    expect(oidar?.id).toBe('services.oidar');
    expect(matchServiceFamily('998439')?.id).toBe('services.oidar');
  });

  it('rejects unknown and OTH placeOfSupplyState', () => {
    expectCode(
      () =>
        tax().calculate({
          seller: party('KA', KA_GSTIN),
          buyer: party('KA', KA_GSTIN),
          items: [{
            type: 'PRODUCT',
            hsn: '8471',
            amount: { amount: 10000, currency: 'INR' },
            quantity: 1,
            pricingMode: PricingMode.EXCLUSIVE,
            placeOfSupplyState: 'XX',
          }],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );

    expectCode(
      () =>
        tax().calculate({
          seller: party('KA', KA_GSTIN),
          buyer: party('KA', KA_GSTIN),
          items: [{
            type: 'PRODUCT',
            hsn: '8471',
            amount: { amount: 10000, currency: 'INR' },
            quantity: 1,
            pricingMode: PricingMode.EXCLUSIVE,
            placeOfSupplyState: 'OTH',
          }],
          calculationDate: DATE,
        }),
      TaxEngineErrorCode.INVALID_INPUT,
    );
  });

  it('serviceFamilyRules config override changes PoS resolution', () => {
    const customFamilies = [
      ...DEFAULT_SERVICE_FAMILY_RULES.filter((r) => r.id !== 'services.oidar'),
      { id: 'services.oidar', prefixes: ['998434', '998439'], resolve: 'seller' as const },
    ];
    const customTax = new Tax('IN', {
      stateCodeSource: StateCodeSources.STATE,
      serviceFamilyRules: customFamilies,
    });
    const result = customTax.calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('MH', MH_GSTIN),
      items: [{
        type: 'SERVICE',
        sac: '998434',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'KA', ruleId: 'services.oidar' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
  });

  it('placeOfSupplyRules config replaces default rules', () => {
    const rules = createDefaultPlaceOfSupplyRules([
      { id: 'services.custom-seller', prefixes: ['998314'], resolve: 'seller' },
    ]);
    const customTax = new Tax('IN', {
      stateCodeSource: StateCodeSources.STATE,
      placeOfSupplyRules: rules,
    });
    const result = customTax.calculate({
      seller: party('KA', KA_GSTIN),
      buyer: party('MH', MH_GSTIN),
      items: [{
        type: 'SERVICE',
        sac: '998314',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.details).toMatchObject({
      placeOfSupply: { state: 'KA', ruleId: 'services.custom-seller' },
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.SGST,
    ]);
  });

  it('UT place of supply uses UTGST with CGST', () => {
    const result = tax().calculate({
      seller: { state: 'CH', gstin: '04AABCU9603R1ZV' },
      buyer: { state: 'CH', gstin: '04AABCU9603R1ZV' },
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.taxes.map((t) => t.type)).toEqual([
      IndiaTaxHead.CGST,
      IndiaTaxHead.UTGST,
    ]);
  });
});
