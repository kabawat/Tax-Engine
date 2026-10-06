import type { Money } from './money.js';
import type { PricingMode } from './pricing-mode.js';
import type { CurrencyCode } from './money.js';
import type { TaxRate } from './tax-rule.js';
import type { TaxType } from './tax-type.js';

/** A single applied tax line in the result breakdown. */
export interface TaxLineItem {
  readonly ruleId: string;
  readonly taxName: string;
  readonly taxType: TaxType;
  readonly rate: TaxRate;
  readonly taxableBase: Money;
  readonly taxAmount: Money;
  readonly isCompound: boolean;
}

/** Complete tax calculation result. */
export interface TaxResult {
  readonly originalAmount: Money;
  readonly taxableAmount: Money;
  readonly currency: CurrencyCode;
  readonly pricingMode: PricingMode;
  readonly taxes: readonly TaxLineItem[];
  readonly totalTax: Money;
  readonly finalAmount: Money;
}
