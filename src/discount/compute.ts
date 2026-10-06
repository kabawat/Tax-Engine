import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import type { RoundingMode } from '../models/money.js';
import { roundAmount } from '../money/operations.js';
import {
  DiscountMode,
  DiscountType,
  type DiscountInput,
} from './types.js';

function reject(message: string, details?: unknown): never {
  throw new TaxEngineError(message, {
    code: TaxEngineErrorCode.INVALID_INPUT,
    details,
  });
}

export function validateDiscountInput(discount: DiscountInput): void {
  if (discount.type !== DiscountType.FIXED && discount.type !== DiscountType.PERCENTAGE) {
    reject('discount.type must be FIXED or PERCENTAGE', { field: 'discount.type' });
  }
  if (
    discount.mode !== undefined &&
    discount.mode !== DiscountMode.BEFORE_TAX &&
    discount.mode !== DiscountMode.AFTER_TAX
  ) {
    reject('discount.mode must be BEFORE_TAX or AFTER_TAX', { field: 'discount.mode' });
  }
  if (!Number.isFinite(discount.value) || discount.value < 0) {
    reject('discount.value must be a non-negative finite number', {
      field: 'discount.value',
    });
  }
  if (discount.type === DiscountType.PERCENTAGE && discount.value > 100) {
    reject('discount percentage cannot exceed 100', { field: 'discount.value' });
  }
}

/** Compute monetary discount against `base` (pre-tax base or post-tax gross). */
export function computeDiscountAmount(
  base: number,
  discount: DiscountInput,
  precision: number,
  roundingMode: RoundingMode,
): number {
  validateDiscountInput(discount);

  const amount =
    discount.type === DiscountType.FIXED
      ? discount.value
      : (base * discount.value) / 100;

  const rounded = roundAmount(amount, precision, roundingMode);
  if (rounded > base) {
    reject('Discount cannot exceed applicable base', {
      field: 'discount.value',
      base,
      discountAmount: rounded,
    });
  }
  return rounded;
}
