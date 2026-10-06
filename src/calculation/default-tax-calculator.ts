import type { TaxCalculator } from '../core/TaxCalculator.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxResult } from '../models/tax-output.js';
import type { TaxRule } from '../models/tax-rule.js';
import type { MoneyConfig } from '../models/money.js';
import { validateTaxInput } from '../validators/validate-tax-input.js';
import { calculateTaxes } from './calculate-taxes.js';

export class DefaultTaxCalculator implements TaxCalculator {
  constructor(private readonly moneyConfig?: MoneyConfig) {}

  calculate(input: TaxInput, rules: readonly TaxRule[]): TaxResult {
    validateTaxInput(input);
    return calculateTaxes(input, rules, this.moneyConfig);
  }
}
