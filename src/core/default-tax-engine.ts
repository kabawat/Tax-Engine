import type { TaxRuleRegistry } from '../registry/TaxRuleRegistry.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxResult } from '../models/tax-output.js';
import type { MoneyConfig } from '../models/money.js';
import { DefaultTaxCalculator } from '../calculation/default-tax-calculator.js';
import type { TaxCalculator } from './TaxCalculator.js';
import type { TaxEngine } from './TaxEngine.js';

export interface DefaultTaxEngineOptions {
  readonly registry: TaxRuleRegistry;
  readonly calculator?: TaxCalculator;
  readonly moneyConfig?: MoneyConfig;
}

export class DefaultTaxEngine implements TaxEngine {
  private readonly registry: TaxRuleRegistry;
  private readonly calculator: TaxCalculator;

  constructor(options: DefaultTaxEngineOptions) {
    this.registry = options.registry;
    this.calculator =
      options.calculator ?? new DefaultTaxCalculator(options.moneyConfig);
  }

  calculate(input: TaxInput): TaxResult {
    const rules = this.registry.resolveApplicable(input);
    return this.calculator.calculate(input, rules);
  }
}
