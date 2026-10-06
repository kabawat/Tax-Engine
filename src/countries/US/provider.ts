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
import { usaRules } from '../../rules/usa/rules.js';
import type { TaxRule } from '../../models/tax-rule.js';

export interface UsTaxConfig {
  readonly discountMode?: DiscountMode;
}

export interface UsTaxInput {
  readonly amount: { readonly amount: number; readonly currency: string };
  readonly quantity: number;
  readonly item: {
    readonly type: 'PRODUCT' | 'SERVICE';
    readonly category: string;
  };
  readonly pricingMode: PricingMode;
  readonly discount?: DiscountInput;
  readonly jurisdiction: {
    readonly country?: string;
    readonly state: string;
    readonly city?: string;
  };
  readonly calculationDate: string;
}

function resolveRules(input: UsTaxInput): readonly TaxRule[] {
  const registry = new InMemoryTaxRuleRegistry();
  registry.registerMany(usaRules);
  const jurisdiction =
    input.jurisdiction.city !== undefined
      ? {
          country: 'US' as const,
          state: input.jurisdiction.state,
          city: input.jurisdiction.city,
        }
      : { country: 'US' as const, state: input.jurisdiction.state };

  return registry.resolveApplicable({
    amount: input.amount,
    quantity: input.quantity,
    item: {
      type: input.item.type === 'SERVICE' ? ItemType.SERVICE : ItemType.PRODUCT,
      category: input.item.category,
    },
    pricingMode: input.pricingMode,
    jurisdiction,
    calculationDate: input.calculationDate,
  });
}

export class UsTaxCalculator implements CountryTaxCalculator<UsTaxInput> {
  readonly country = 'US';

  constructor(private readonly config: UsTaxConfig = {}) {}

  calculate(input: UsTaxInput): TaxOutcome {
    if (input.jurisdiction.country !== undefined && input.jurisdiction.country !== 'US') {
      throw new TaxEngineError('US calculator only accepts US jurisdiction', {
        code: TaxEngineErrorCode.INVALID_INPUT,
        details: { country: input.jurisdiction.country },
      });
    }

    const rules = resolveRules(input);
    if (rules.length === 0) {
      throw new TaxEngineError('No US sales-tax rule matched the input', {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: {
          state: input.jurisdiction.state,
          city: input.jurisdiction.city,
          category: input.item.category,
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

    return {
      country: 'US',
      taxability: 'TAXABLE',
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
      finalAmount: result.finalAmount,
      ...(result.discount !== undefined ? { discount: result.discount } : {}),
      details: { limitedSupport: true },
    };
  }
}

export class UsTaxProvider implements CountryTaxProvider<UsTaxInput> {
  readonly country = 'US';

  constructor(private readonly config: UsTaxConfig = {}) {}

  createCalculator(): CountryTaxCalculator<UsTaxInput> {
    return new UsTaxCalculator(this.config);
  }
}
