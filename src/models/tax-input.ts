import type { Exemption } from './exemption.js';
import type { TaxItem } from './item.js';
import type { Jurisdiction } from './jurisdiction.js';
import type { Money } from './money.js';
import type { PricingMode } from './pricing-mode.js';

/**
 * Complete input contract for tax calculation.
 * Product and service inputs use the same shape via {@link TaxItem}.
 */
export interface TaxInput {
  readonly amount: Money;
  readonly quantity: number;
  readonly item: TaxItem;
  readonly pricingMode: PricingMode;
  readonly jurisdiction: Jurisdiction;
  /** Explicit calculation date (ISO 8601 YYYY-MM-DD). Never inferred from system clock. */
  readonly calculationDate: string;
  readonly exemptions?: readonly Exemption[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}
