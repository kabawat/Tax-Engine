import type { EffectivePeriod } from './effective-period.js';
import type { Exemption } from './exemption.js';
import type { Jurisdiction } from './jurisdiction.js';
import type { TaxCategory } from './tax-category.js';
import type { TaxType } from './tax-type.js';

/** How a tax rate is expressed (percentage, fixed amount, etc.). */
export const TaxRateBasis = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
} as const;

export type TaxRateBasis = (typeof TaxRateBasis)[keyof typeof TaxRateBasis];

export interface TaxRate {
  readonly value: number;
  readonly basis: TaxRateBasis | (string & {});
}

/** Describes whether and how a tax compounds on other taxes. */
export interface CompoundBehavior {
  readonly isCompound: boolean;
  readonly appliesOn?: string;
}

/** Configuration for determining the taxable base (data only, no evaluation). */
export interface TaxableBaseConfig {
  readonly includePreviousTaxes?: boolean;
  readonly adjustments?: Readonly<Record<string, unknown>>;
}

/** Exemption configuration attached to a rule (data only, no evaluation). */
export interface RuleExemptionConfig {
  readonly exemptions?: readonly Exemption[];
  readonly exemptCategories?: readonly string[];
}

/**
 * Generic tax rule domain model.
 * Rules are data — country-specific rules are supplied as configuration.
 */
export interface TaxRule {
  readonly id: string;
  readonly name: string;
  readonly taxType: TaxType;
  readonly rate: TaxRate;
  readonly category: TaxCategory;
  readonly jurisdiction: Jurisdiction;
  readonly effective: EffectivePeriod;
  readonly priority: number;
  readonly compound: CompoundBehavior;
  readonly taxableBase: TaxableBaseConfig;
  readonly exemptionConfig?: RuleExemptionConfig;
  readonly applicability?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
