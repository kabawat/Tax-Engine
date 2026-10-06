import { ItemType } from '../../models/item.js';
import { KnownTaxType } from '../../models/tax-type.js';
import { TaxRateBasis, type TaxRule } from '../../models/tax-rule.js';

const STANDARD_FROM = '2024-01-01';
const FUTURE_FROM = '2027-01-01';
const STANDARD_UNTIL = '2026-12-31';

export const uaeRules: readonly TaxRule[] = [
  {
    id: 'ae-vat-standard',
    name: 'UAE VAT Standard',
    taxType: KnownTaxType.VAT,
    rate: { value: 5, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'AE' },
    effective: { effectiveFrom: STANDARD_FROM, effectiveUntil: STANDARD_UNTIL },
    priority: 1,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: {
      itemTypes: [ItemType.PRODUCT, ItemType.SERVICE],
      itemCategories: ['GENERAL', 'CONSULTING', 'STANDARD'],
    },
  },
  {
    id: 'ae-vat-zero-rated',
    name: 'UAE VAT Zero Rated',
    taxType: KnownTaxType.VAT,
    rate: { value: 0, basis: TaxRateBasis.PERCENTAGE },
    category: 'ZERO',
    jurisdiction: { country: 'AE' },
    effective: { effectiveFrom: STANDARD_FROM },
    priority: 1,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemCategories: ['ZERO'] },
  },
  {
    id: 'ae-vat-future',
    name: 'UAE VAT Future Rate',
    taxType: KnownTaxType.VAT,
    rate: { value: 7, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'AE' },
    effective: { effectiveFrom: FUTURE_FROM },
    priority: 1,
    compound: { isCompound: false },
    taxableBase: {},
    applicability: { itemCategories: ['GENERAL', 'CONSULTING', 'STANDARD'] },
  },
];
