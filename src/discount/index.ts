export {
  DiscountMode,
  DiscountType,
  resolveDiscountMode,
  type DiscountInput,
  type AppliedDiscount,
  type DiscountMode as DiscountModeType,
  type DiscountType as DiscountTypeAlias,
} from './types.js';
export { validateDiscountInput, computeDiscountAmount } from './compute.js';
export {
  calculateLineWithDiscount,
  type LineDiscountCalculationInput,
  type LineDiscountCalculationResult,
} from './calculate-with-discount.js';
