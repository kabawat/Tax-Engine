import type {
  CountryTaxCalculator,
  CountryTaxProvider,
  TaxOutcome,
} from '../../core/country/types.js';
import { ChargeMode, LiabilityParty } from '../../core/country/types.js';
import { calculateLineWithDiscount } from '../../discount/calculate-with-discount.js';
import type { DiscountInput, DiscountMode } from '../../discount/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { ItemType } from '../../models/item.js';
import { PricingMode } from '../../models/pricing-mode.js';
import { InMemoryTaxRuleRegistry } from '../../registry/in-memory-tax-rule.registry.js';
import { uaeRules } from '../../rules/uae/rules.js';
import type { TaxRule } from '../../models/tax-rule.js';

export interface UaeTaxConfig {
  readonly discountMode?: DiscountMode;
}

export interface UaeTaxInput {
  readonly amount: { readonly amount: number; readonly currency: string };
  readonly quantity: number;
  readonly item: {
    readonly type: 'PRODUCT' | 'SERVICE';
    readonly category: string;
  };
  readonly pricingMode: PricingMode;
  readonly discount?: DiscountInput;
  readonly jurisdiction?: { readonly country?: string; readonly state?: string };
  readonly calculationDate: string;
}

function resolveRules(input: UaeTaxInput): readonly TaxRule[] {
  const registry = new InMemoryTaxRuleRegistry();
  registry.registerMany(uaeRules);
  return registry.resolveApplicable({
    amount: input.amount,
    quantity: input.quantity,
    item: {
      type: input.item.type === 'SERVICE' ? ItemType.SERVICE : ItemType.PRODUCT,
      category: input.item.category,
    },
    pricingMode: input.pricingMode,
    jurisdiction: { country: 'AE', ...(input.jurisdiction?.state !== undefined ? { state: input.jurisdiction.state } : {}) },
    calculationDate: input.calculationDate,
  });
}

export class UaeTaxCalculator implements CountryTaxCalculator<UaeTaxInput> {
  readonly country = 'AE';

  constructor(private readonly config: UaeTaxConfig = {}) {}

  calculate(input: UaeTaxInput): TaxOutcome {
    if (input.jurisdiction?.country !== undefined && input.jurisdiction.country !== 'AE') {
      throw new TaxEngineError('UAE calculator only accepts AE jurisdiction', {
        code: TaxEngineErrorCode.INVALID_INPUT,
        details: { country: input.jurisdiction.country },
      });
    }

    const rules = resolveRules(input);
    if (rules.length === 0) {
      throw new TaxEngineError('No UAE VAT rule matched the input', {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: {
          category: input.item.category,
          itemType: input.item.type,
          calculationDate: input.calculationDate,
        },
      });
    }

    const result = calculateLineWithDiscount({
      amount: input.amount.amount,
      currency: input.amount.currency,
      quantity: input.quantity,
      pricingMode: input.pricingMode,
      rules,
      calculationDate: input.calculationDate,
      itemType: input.item.type,
      ...(input.discount !== undefined ? { discount: input.discount } : {}),
      ...(this.config.discountMode !== undefined
        ? { configDiscountMode: this.config.discountMode }
        : {}),
    });

    const zeroRated = result.taxes.every((t) => t.taxAmount.amount === 0);

    return {
      country: 'AE',
      taxability: zeroRated ? 'ZERO_RATED' : 'TAXABLE',
      chargeMode: ChargeMode.FORWARD_CHARGE,
      liabilityParty: LiabilityParty.SELLER,
      currency: result.originalAmount.currency,
      pricingMode: input.pricingMode,
      originalAmount: result.originalAmount,
      taxableAmount: result.taxableAmount,
      taxes: result.taxes.map((line) => ({
        type: String(line.taxType),
        rate: line.rate.value,
        taxableBase: line.taxableBase,
        amount: line.taxAmount,
        name: line.taxName,
      })),
      totalTax: result.totalTax,
      roundingDifference: {
        amount: 0,
        currency: result.originalAmount.currency,
      },
      finalAmount: result.finalAmount,
      ...(result.discount !== undefined ? { discount: result.discount } : {}),
      details: { limitedSupport: true },
    };
  }
}

export class UaeTaxProvider implements CountryTaxProvider<UaeTaxInput> {
  readonly country = 'AE';

  constructor(private readonly config: UaeTaxConfig = {}) {}

  createCalculator(): CountryTaxCalculator<UaeTaxInput> {
    return new UaeTaxCalculator(this.config);
  }
}
