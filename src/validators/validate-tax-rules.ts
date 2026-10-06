import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import type { TaxRule } from '../models/tax-rule.js';
import { validateTaxRule } from './validate-tax-rule.js';

function reject(message: string, code: TaxEngineErrorCode, details?: unknown): never {
  throw new TaxEngineError(message, { code, details });
}

export function validateTaxRules(rules: readonly TaxRule[]): void {
  const seenIds = new Set<string>();

  for (const rule of rules) {
    validateTaxRule(rule);

    if (seenIds.has(rule.id)) {
      reject('Duplicate rule ID in rule set', TaxEngineErrorCode.INVALID_RULE_CONFIGURATION, {
        ruleId: rule.id,
      });
    }

    seenIds.add(rule.id);
  }
}
