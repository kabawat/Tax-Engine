import type { TaxInput } from '../models/tax-input.js';
import type { TaxResult } from '../models/tax-output.js';
import type { TaxRule } from '../models/tax-rule.js';

/** Contract for tax calculation. */
export interface TaxCalculator {
  calculate(input: TaxInput, rules: readonly TaxRule[]): TaxResult;
}
