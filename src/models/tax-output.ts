import type { Money } from './money.js';
import type { PricingMode } from './pricing-mode.js';
import type { CurrencyCode } from './money.js';
import type { TaxRate } from './tax-rule.js';
import type { TaxType } from './tax-type.js';

export interface TaxLineItem {
  readonly ruleId: string;
  readonly taxName: string;
  readonly taxType: TaxType;
  readonly rate: TaxRate;
  readonly taxableBase: Money;
  readonly taxAmount: Money;
  readonly isCompound: boolean;
}

export interface TaxResult {
  readonly originalAmount: Money;
  readonly taxableAmount: Money;
  readonly currency: CurrencyCode;
  readonly pricingMode: PricingMode;
  readonly taxes: readonly TaxLineItem[];
  readonly totalTax: Money;
  readonly finalAmount: Money;
}
