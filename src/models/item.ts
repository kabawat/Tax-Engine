export const ItemType = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export interface TaxItem {
  readonly type: ItemType;
  readonly category: string;
  readonly code?: string;
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
