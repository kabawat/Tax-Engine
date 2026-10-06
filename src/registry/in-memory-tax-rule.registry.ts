import type { TaxRuleResolver } from '../core/RuleResolver.js';
import type { Jurisdiction } from '../models/jurisdiction.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxRule } from '../models/tax-rule.js';
import { DefaultTaxRuleResolver } from '../resolution/default-tax-rule.resolver.js';
import { jurisdictionMatches } from '../resolution/match.js';
import { compareRuleIds } from '../resolution/order.js';
import { validateTaxRule } from '../validators/validate-tax-rule.js';
import type { TaxRuleRegistry } from './TaxRuleRegistry.js';

export class InMemoryTaxRuleRegistry implements TaxRuleRegistry {
  private readonly rules = new Map<string, TaxRule>();
  private readonly resolver: TaxRuleResolver;

  constructor(resolver: TaxRuleResolver = new DefaultTaxRuleResolver()) {
    this.resolver = resolver;
  }

  register(rule: TaxRule): void {
    validateTaxRule(rule);
    this.rules.set(rule.id, rule);
  }

  registerMany(rules: readonly TaxRule[]): void {
    for (const rule of rules) {
      this.register(rule);
    }
  }

  remove(id: string): boolean {
    return this.rules.delete(id);
  }

  clear(): void {
    this.rules.clear();
  }

  getAll(): readonly TaxRule[] {
    return [...this.rules.values()].sort((left, right) => compareRuleIds(left.id, right.id));
  }

  getById(id: string): TaxRule | undefined {
    return this.rules.get(id);
  }

  getByJurisdiction(jurisdiction: Jurisdiction): readonly TaxRule[] {
    return this.getAll().filter((rule) =>
      jurisdictionMatches(rule.jurisdiction, jurisdiction),
    );
  }

  resolveApplicable(input: TaxInput): readonly TaxRule[] {
    return this.resolver.resolve(input, this.getAll());
  }
}
