import type { TaxInput } from '../models/tax-input.js';
import type { TaxRule } from '../models/tax-rule.js';

/** Contract for resolving applicable rules. */
export interface TaxRuleResolver {
  resolve(input: TaxInput, rules: readonly TaxRule[]): readonly TaxRule[];
}
