import type { EffectivePeriod } from './effective-period.js';
import type { Exemption } from './exemption.js';
import type { Jurisdiction } from './jurisdiction.js';
import type { TaxCategory } from './tax-category.js';
import type { TaxType } from './tax-type.js';

export const TaxRateBasis = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
} as const;

export type TaxRateBasis = (typeof TaxRateBasis)[keyof typeof TaxRateBasis];

export interface TaxRate {
  readonly value: number;
  readonly basis: TaxRateBasis | (string & {});
}

export interface CompoundBehavior {
  readonly isCompound: boolean;
  readonly appliesOn?: string;
}

export interface TaxableBaseConfig {
  readonly includePreviousTaxes?: boolean;
  readonly adjustments?: Readonly<Record<string, unknown>>;
}

export interface RuleExemptionConfig {
  readonly exemptions?: readonly Exemption[];
  readonly exemptCategories?: readonly string[];
}

// Tax rule as data (country rules supplied as config)
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
