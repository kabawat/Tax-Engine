import type { Exemption } from './exemption.js';
import type { TaxItem } from './item.js';
import type { Jurisdiction } from './jurisdiction.js';
import type { Money } from './money.js';
import type { PricingMode } from './pricing-mode.js';

export interface TaxInput {
  readonly amount: Money;
  readonly quantity: number;
  readonly item: TaxItem;
  readonly pricingMode: PricingMode;
  readonly jurisdiction: Jurisdiction;
  // ISO date YYYY-MM-DD (not inferred from clock)
  readonly calculationDate: string;
  readonly exemptions?: readonly Exemption[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
