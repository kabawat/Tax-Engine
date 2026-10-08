import type { TaxRuleResolver } from '../core/RuleResolver.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxRule } from '../models/tax-rule.js';
import { isRuleApplicable } from './match.js';
import { sortApplicableRules } from './order.js';

export class DefaultTaxRuleResolver implements TaxRuleResolver {
  resolve(input: TaxInput, rules: readonly TaxRule[]): readonly TaxRule[] {
    const applicable = rules.filter((rule) => isRuleApplicable(rule, input));
    return sortApplicableRules(applicable);
  }
}
