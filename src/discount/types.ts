import type { Money } from '../models/money.js';

export const DiscountMode = {
  BEFORE_TAX: 'BEFORE_TAX',
  AFTER_TAX: 'AFTER_TAX',
} as const;

export type DiscountMode = (typeof DiscountMode)[keyof typeof DiscountMode];

export const DiscountType = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export interface DiscountInput {
  readonly type: DiscountType;
  readonly value: number;
  readonly mode?: DiscountMode;
}

export interface AppliedDiscount {
  readonly type: DiscountType;
  readonly value: number;
  readonly mode: DiscountMode;
  readonly amount: Money;
}

export function resolveDiscountMode(
  discountMode: DiscountMode | undefined,
  configDiscountMode: DiscountMode | undefined,
): DiscountMode {
  return discountMode ?? configDiscountMode ?? DiscountMode.BEFORE_TAX;
}
