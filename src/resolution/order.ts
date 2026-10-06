import type { TaxRule } from '../models/tax-rule.js';
import { jurisdictionSpecificity } from './match.js';

// Locale-independent string compare
export function compareRuleIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function sortApplicableRules(rules: readonly TaxRule[]): readonly TaxRule[] {
  return [...rules].sort((left, right) => {
    const specificityDiff =
      jurisdictionSpecificity(right.jurisdiction) -
      jurisdictionSpecificity(left.jurisdiction);
    if (specificityDiff !== 0) {
      return specificityDiff;
    }

    const priorityDiff = left.priority - right.priority;
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return compareRuleIds(left.id, right.id);
  });
}
