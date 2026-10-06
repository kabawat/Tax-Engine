/** Unified item kind — products and services share the same tax domain model. */
export const ItemType = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

/**
 * Generic product or service representation.
 * No product-specific or service-specific calculation logic belongs here.
 */
export interface TaxItem {
  readonly type: ItemType;
  readonly category: string;
  readonly code?: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
