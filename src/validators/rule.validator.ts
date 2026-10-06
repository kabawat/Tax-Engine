import type { TaxRule } from '../models/tax-rule.js';
import type { ValidationResult } from './input.validator.js';

/** Contract for tax rule validation. */
export interface TaxRuleValidator {
  validate(rule: TaxRule): ValidationResult;
}
