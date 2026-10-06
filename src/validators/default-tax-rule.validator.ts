import type { TaxRule } from '../models/tax-rule.js';
import { TaxEngineError } from '../errors/TaxEngineError.js';
import type { TaxRuleValidator } from './rule.validator.js';
import type { ValidationResult } from './input.validator.js';
import { validateTaxRule } from './validate-tax-rule.js';

export class DefaultTaxRuleValidator implements TaxRuleValidator {
  validate(rule: TaxRule): ValidationResult {
    try {
      validateTaxRule(rule);
      return { valid: true, issues: [] };
    } catch (error) {
      if (error instanceof TaxEngineError) {
        return {
          valid: false,
          issues: [{ message: error.message, code: error.code }],
        };
      }
      throw error;
    }
  }
}
