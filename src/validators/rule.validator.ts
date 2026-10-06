import type { TaxRule } from '../models/tax-rule.js';
import type { ValidationResult } from './input.validator.js';

export interface TaxRuleValidator {
  validate(rule: TaxRule): ValidationResult;
}
