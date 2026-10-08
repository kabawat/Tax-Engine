import { ItemType } from '../../models/item.js';
import { KnownTaxType } from '../../models/tax-type.js';
import { TaxRateBasis, type TaxRule } from '../../models/tax-rule.js';

const OPEN = { effectiveFrom: '2024-04-01' } as const;

/** @deprecated Use new Tax("IN") */
export const indiaInterstateGstRules: readonly TaxRule[] = [
  {
    id: 'in-gst-product-standard',
    name: 'GST Product Standard',
    taxType: KnownTaxType.GST,
    rate: { value: 18, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'IN' },
    effective: OPEN,
    priority: 10,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemTypes: [ItemType.PRODUCT], itemCategories: ['GENERAL'] },
  },
  {
    id: 'in-gst-service-standard',
    name: 'GST Service Standard',
    taxType: KnownTaxType.GST,
    rate: { value: 18, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'IN' },
    effective: OPEN,
    priority: 10,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemTypes: [ItemType.SERVICE], itemCategories: ['GENERAL'] },
  },
];

/** @deprecated Use new Tax("IN") */
export const indiaKarnatakaGstRules: readonly TaxRule[] = [
  {
    id: 'in-ka-cgst',
    name: 'CGST Karnataka',
    taxType: KnownTaxType.GST,
    rate: { value: 9, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'IN', state: 'KA' },
    effective: OPEN,
    priority: 1,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: {
      itemTypes: [ItemType.PRODUCT, ItemType.SERVICE],
      itemCategories: ['GENERAL'],
    },
  },
  {
    id: 'in-ka-sgst',
    name: 'SGST Karnataka',
    taxType: KnownTaxType.GST,
    rate: { value: 9, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'IN', state: 'KA' },
    effective: OPEN,
    priority: 2,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: {
      itemTypes: [ItemType.PRODUCT, ItemType.SERVICE],
      itemCategories: ['GENERAL'],
    },
  },
];

const indiaSharedRules: readonly TaxRule[] = [
  {
    id: 'in-gst-essential',
    name: 'GST Essential Rate',
    taxType: KnownTaxType.GST,
    rate: { value: 5, basis: TaxRateBasis.PERCENTAGE },
    category: 'ESSENTIAL',
    jurisdiction: { country: 'IN' },
    effective: OPEN,
    priority: 5,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemCategories: ['ESSENTIAL'] },
  },
  {
    id: 'in-gst-expired',
    name: 'Expired GST Rate',
    taxType: KnownTaxType.GST,
    rate: { value: 12, basis: TaxRateBasis.PERCENTAGE },
    category: 'LEGACY',
    jurisdiction: { country: 'IN' },
    effective: { effectiveFrom: '2023-01-01', effectiveUntil: '2023-12-31' },
    priority: 1,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemCategories: ['LEGACY'] },
  },
];

/** @deprecated Use new Tax("IN") */
export const indiaRules: readonly TaxRule[] = [
  ...indiaInterstateGstRules,
  ...indiaSharedRules,
];
