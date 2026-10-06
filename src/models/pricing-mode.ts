/** Whether the supplied amount includes or excludes tax. */
export const PricingMode = {
  INCLUSIVE: 'INCLUSIVE',
  EXCLUSIVE: 'EXCLUSIVE',
} as const;

export type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];
