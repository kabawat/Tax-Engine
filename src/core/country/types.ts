import type { Money } from '../../models/money.js';
import type { PricingMode } from '../../models/pricing-mode.js';
import type { AppliedDiscount } from '../../discount/types.js';

export const ChargeMode = {
  FORWARD_CHARGE: 'FORWARD_CHARGE',
  REVERSE_CHARGE: 'REVERSE_CHARGE',
} as const;

export type ChargeMode = (typeof ChargeMode)[keyof typeof ChargeMode];

export const LiabilityParty = {
  SELLER: 'SELLER',
  BUYER: 'BUYER',
  NONE: 'NONE',
} as const;

export type LiabilityParty = (typeof LiabilityParty)[keyof typeof LiabilityParty];

export interface CountryTaxLine {
  readonly type: string;
  readonly rate: number;
  readonly taxableBase: Money;
  readonly amount: Money;
  readonly name?: string;
}

export interface TaxOutcome {
  readonly country: string;
  readonly taxability: string;
  readonly chargeMode: ChargeMode | 'MIXED';
  readonly liabilityParty: LiabilityParty | 'MIXED';
  readonly currency: string;
  readonly pricingMode: PricingMode | 'MIXED';
  readonly originalAmount: Money;
  readonly taxableAmount: Money;
  readonly taxes: readonly CountryTaxLine[];
  readonly totalTax: Money;
  readonly roundingDifference: Money;
  readonly finalAmount: Money;
  readonly discount?: AppliedDiscount;
  readonly lines?: readonly TaxOutcome[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CountryTaxCalculator<TInput = unknown> {
  readonly country: string;
  calculate(input: TInput): TaxOutcome;
}

export interface CountryTaxProvider<TInput = unknown> {
  readonly country: string;
  createCalculator(): CountryTaxCalculator<TInput>;
}
