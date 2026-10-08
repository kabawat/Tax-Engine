import type { RuleApplicability } from '../models/applicability.js';
import type { Jurisdiction } from '../models/jurisdiction.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxItem } from '../models/item.js';
import type { TaxRule } from '../models/tax-rule.js';

export function jurisdictionMatches(
  ruleJurisdiction: Jurisdiction,
  inputJurisdiction: Jurisdiction,
): boolean {
  if (ruleJurisdiction.country !== inputJurisdiction.country) {
    return false;
  }
  if (
    ruleJurisdiction.state !== undefined &&
    ruleJurisdiction.state !== inputJurisdiction.state
  ) {
    return false;
  }
  if (
    ruleJurisdiction.city !== undefined &&
    ruleJurisdiction.city !== inputJurisdiction.city
  ) {
    return false;
  }
  if (
    ruleJurisdiction.postalCode !== undefined &&
    ruleJurisdiction.postalCode !== inputJurisdiction.postalCode
  ) {
    return false;
  }
  return true;
}

export function jurisdictionSpecificity(jurisdiction: Jurisdiction): number {
  if (jurisdiction.postalCode !== undefined) {
    return 3;
  }
  if (jurisdiction.city !== undefined) {
    return 2;
  }
  if (jurisdiction.state !== undefined) {
    return 1;
  }
  return 0;
}

export function isEffectiveOn(rule: TaxRule, calculationDate: string): boolean {
  if (calculationDate < rule.effective.effectiveFrom) {
    return false;
  }
  if (
    rule.effective.effectiveUntil !== undefined &&
    calculationDate > rule.effective.effectiveUntil
  ) {
    return false;
  }
  return true;
}

function getApplicability(rule: TaxRule): RuleApplicability {
  return (rule.applicability ?? {}) as RuleApplicability;
}

export function matchesItemType(rule: TaxRule, item: TaxItem): boolean {
  const itemTypes = getApplicability(rule).itemTypes;
  if (itemTypes === undefined) {
    return true;
  }
  return itemTypes.includes(item.type);
}

export function matchesCategory(rule: TaxRule, item: TaxItem): boolean {
  const applicability = getApplicability(rule);
  if (applicability.matchAllCategories === true) {
    return true;
  }
  if (applicability.itemCategories !== undefined) {
    return applicability.itemCategories.includes(item.category);
  }
  return rule.category === item.category;
}

export function isBlockedByExemption(rule: TaxRule, input: TaxInput): boolean {
  const exemptCategories = rule.exemptionConfig?.exemptCategories;
  if (exemptCategories === undefined || exemptCategories.length === 0) {
    return false;
  }
  if (input.exemptions === undefined || input.exemptions.length === 0) {
    return false;
  }
  if (!exemptCategories.includes(input.item.category)) {
    return false;
  }
  return input.exemptions.some(
    (exemption) =>
      exemption.applicableCategories === undefined ||
      exemption.applicableCategories.length === 0 ||
      exemption.applicableCategories.includes(input.item.category),
  );
}

export function isRuleApplicable(rule: TaxRule, input: TaxInput): boolean {
  if (!jurisdictionMatches(rule.jurisdiction, input.jurisdiction)) {
    return false;
  }
  if (!isEffectiveOn(rule, input.calculationDate)) {
    return false;
  }
  if (!matchesCategory(rule, input.item)) {
    return false;
  }
  if (!matchesItemType(rule, input.item)) {
    return false;
  }
  if (isBlockedByExemption(rule, input)) {
    return false;
  }
  return true;
}
