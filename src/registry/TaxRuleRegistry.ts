import type { Jurisdiction } from '../models/jurisdiction.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxRule } from '../models/tax-rule.js';

export interface TaxRuleRegistry {
  register(rule: TaxRule): void;
  registerMany(rules: readonly TaxRule[]): void;
  remove(id: string): boolean;
  clear(): void;
  getAll(): readonly TaxRule[];
  getById(id: string): TaxRule | undefined;
  getByJurisdiction(jurisdiction: Jurisdiction): readonly TaxRule[];
  resolveApplicable(input: TaxInput): readonly TaxRule[];
}
