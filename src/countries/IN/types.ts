export const IndiaTaxHead = {
  CGST: 'CGST',
  SGST: 'SGST',
  UTGST: 'UTGST',
  IGST: 'IGST',
  CESS: 'CESS',
} as const;

export type IndiaTaxHead = (typeof IndiaTaxHead)[keyof typeof IndiaTaxHead];

export const IndiaTaxability = {
  TAXABLE: 'TAXABLE',
  EXEMPT: 'EXEMPT',
  NIL_RATED: 'NIL_RATED',
  NON_GST: 'NON_GST',
  ZERO_RATED: 'ZERO_RATED',
} as const;

export type IndiaTaxability = (typeof IndiaTaxability)[keyof typeof IndiaTaxability];

export const IndiaTaxpayerType = {
  REGULAR: 'REGULAR',
  COMPOSITION: 'COMPOSITION',
} as const;

export type IndiaTaxpayerType = (typeof IndiaTaxpayerType)[keyof typeof IndiaTaxpayerType];

export const IndiaCustomerType = {
  B2B: 'B2B',
  B2C: 'B2C',
  SEZ: 'SEZ',
} as const;

export type IndiaCustomerType = (typeof IndiaCustomerType)[keyof typeof IndiaCustomerType];

export const SupplyKind = {
  GOODS: 'GOODS',
  SERVICES: 'SERVICES',
} as const;

export type SupplyKind = (typeof SupplyKind)[keyof typeof SupplyKind];
