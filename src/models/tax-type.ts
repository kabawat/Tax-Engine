export const KnownTaxType = {
  GST: 'GST',
  VAT: 'VAT',
  SALES_TAX: 'SALES_TAX',
  STATE_TAX: 'STATE_TAX',
  LOCAL_TAX: 'LOCAL_TAX',
  CESS: 'CESS',
  DUTY: 'DUTY',
  OTHER: 'OTHER',
} as const;

export type KnownTaxType = (typeof KnownTaxType)[keyof typeof KnownTaxType];

export type TaxType = KnownTaxType | (string & {});
