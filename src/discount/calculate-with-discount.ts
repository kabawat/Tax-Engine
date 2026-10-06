import type { MoneyConfig, RoundingMode } from '../models/money.js';
import type { PricingMode } from '../models/pricing-mode.js';
import type { TaxRule } from '../models/tax-rule.js';
import type { TaxLineItem } from '../models/tax-output.js';
import { PricingMode as PricingModes } from '../models/pricing-mode.js';
import {
  money,
  resolvePrecision,
  resolveRoundingMode,
  roundAmount,
} from '../money/operations.js';
import { calculateTaxes } from '../calculation/calculate-taxes.js';
import { ItemType } from '../models/item.js';
import { computeDiscountAmount } from './compute.js';
import {
  DiscountMode,
  resolveDiscountMode,
  type AppliedDiscount,
  type DiscountInput,
  type DiscountMode as DiscountModeType,
} from './types.js';

export interface LineDiscountCalculationInput {
  readonly amount: number;
  readonly currency: string;
  readonly quantity: number;
  readonly pricingMode: PricingMode;
  readonly rules: readonly TaxRule[];
  readonly calculationDate: string;
  readonly itemType?: 'PRODUCT' | 'SERVICE';
  readonly discount?: DiscountInput;
  readonly configDiscountMode?: DiscountModeType;
  readonly moneyConfig?: MoneyConfig;
}

export interface LineDiscountCalculationResult {
  readonly originalAmount: { amount: number; currency: string };
  readonly taxableAmount: { amount: number; currency: string };
  readonly taxes: readonly TaxLineItem[];
  readonly totalTax: { amount: number; currency: string };
  readonly finalAmount: { amount: number; currency: string };
  readonly discount?: AppliedDiscount;
}

function toTaxInput(
  amount: number,
  currency: string,
  pricingMode: PricingMode,
  calculationDate: string,
  itemType: 'PRODUCT' | 'SERVICE',
) {
  return {
    amount: { amount, currency },
    quantity: 1,
    item: {
      type: itemType === 'SERVICE' ? ItemType.SERVICE : ItemType.PRODUCT,
      category: 'GENERAL',
    },
    pricingMode,
    jurisdiction: { country: 'XX' },
    calculationDate,
  };
}

function applyNoDiscountPath(
  input: LineDiscountCalculationInput,
  precision: number,
  roundingMode: RoundingMode,
): LineDiscountCalculationResult {
  const currency = input.currency;
  const lineAmount = roundAmount(
    input.amount * input.quantity,
    precision,
    roundingMode,
  );

  if (input.rules.length === 0) {
    const amount = money(lineAmount, currency);
    return {
      originalAmount: amount,
      taxableAmount: amount,
      taxes: [],
      totalTax: money(0, currency),
      finalAmount: amount,
    };
  }

  const computed = calculateTaxes(
    toTaxInput(
      lineAmount,
      currency,
      input.pricingMode,
      input.calculationDate,
      input.itemType ?? 'PRODUCT',
    ),
    input.rules,
    input.moneyConfig,
  );

  return {
    originalAmount: computed.originalAmount,
    taxableAmount: computed.taxableAmount,
    taxes: computed.taxes,
    totalTax: computed.totalTax,
    finalAmount: computed.finalAmount,
  };
}

/**
 * Shared line calculation with optional discount.
 * AFTER_TAX percentage uses post-tax gross (taxable + tax) as the base.
 */
export function calculateLineWithDiscount(
  input: LineDiscountCalculationInput,
): LineDiscountCalculationResult {
  const precision = resolvePrecision(input.moneyConfig);
  const roundingMode = resolveRoundingMode(input.moneyConfig);
  const currency = input.currency;
  const itemType = input.itemType ?? 'PRODUCT';

  if (input.discount === undefined) {
    return applyNoDiscountPath(input, precision, roundingMode);
  }

  const mode = resolveDiscountMode(input.discount.mode, input.configDiscountMode);
  const lineAmount = roundAmount(
    input.amount * input.quantity,
    precision,
    roundingMode,
  );
  const originalAmount = money(lineAmount, currency);

  if (mode === DiscountMode.BEFORE_TAX) {
    if (input.pricingMode === PricingModes.INCLUSIVE && input.rules.length > 0) {
      const extracted = calculateTaxes(
        toTaxInput(lineAmount, currency, PricingModes.INCLUSIVE, input.calculationDate, itemType),
        input.rules,
        input.moneyConfig,
      );
      const preTaxBase = extracted.taxableAmount.amount;
      const discountAmount = computeDiscountAmount(
        preTaxBase,
        input.discount,
        precision,
        roundingMode,
      );
      const taxable = roundAmount(preTaxBase - discountAmount, precision, roundingMode);
      const taxed = calculateTaxes(
        toTaxInput(taxable, currency, PricingModes.EXCLUSIVE, input.calculationDate, itemType),
        input.rules,
        input.moneyConfig,
      );
      return {
        originalAmount,
        taxableAmount: taxed.taxableAmount,
        taxes: taxed.taxes,
        totalTax: taxed.totalTax,
        finalAmount: taxed.finalAmount,
        discount: {
          type: input.discount.type,
          value: input.discount.value,
          mode,
          amount: money(discountAmount, currency),
        },
      };
    }

    const discountAmount = computeDiscountAmount(
      lineAmount,
      input.discount,
      precision,
      roundingMode,
    );
    const taxable = roundAmount(lineAmount - discountAmount, precision, roundingMode);

    if (input.rules.length === 0) {
      return {
        originalAmount,
        taxableAmount: money(taxable, currency),
        taxes: [],
        totalTax: money(0, currency),
        finalAmount: money(taxable, currency),
        discount: {
          type: input.discount.type,
          value: input.discount.value,
          mode,
          amount: money(discountAmount, currency),
        },
      };
    }

    const taxed = calculateTaxes(
      toTaxInput(taxable, currency, PricingModes.EXCLUSIVE, input.calculationDate, itemType),
      input.rules,
      input.moneyConfig,
    );

    return {
      originalAmount,
      taxableAmount: taxed.taxableAmount,
      taxes: taxed.taxes,
      totalTax: taxed.totalTax,
      finalAmount: taxed.finalAmount,
      discount: {
        type: input.discount.type,
        value: input.discount.value,
        mode,
        amount: money(discountAmount, currency),
      },
    };
  }

  // AFTER_TAX
  let taxableAmount: number;
  let taxes: readonly TaxLineItem[];
  let totalTax: number;
  let gross: number;

  if (input.rules.length === 0) {
    taxableAmount = lineAmount;
    taxes = [];
    totalTax = 0;
    gross = lineAmount;
  } else if (input.pricingMode === PricingModes.INCLUSIVE) {
    const extracted = calculateTaxes(
      toTaxInput(lineAmount, currency, PricingModes.INCLUSIVE, input.calculationDate, itemType),
      input.rules,
      input.moneyConfig,
    );
    taxableAmount = extracted.taxableAmount.amount;
    taxes = extracted.taxes;
    totalTax = extracted.totalTax.amount;
    gross = lineAmount;
  } else {
    const taxed = calculateTaxes(
      toTaxInput(lineAmount, currency, PricingModes.EXCLUSIVE, input.calculationDate, itemType),
      input.rules,
      input.moneyConfig,
    );
    taxableAmount = taxed.taxableAmount.amount;
    taxes = taxed.taxes;
    totalTax = taxed.totalTax.amount;
    gross = taxed.finalAmount.amount;
  }

  const discountAmount = computeDiscountAmount(
    gross,
    input.discount,
    precision,
    roundingMode,
  );
  const finalAmount = roundAmount(gross - discountAmount, precision, roundingMode);

  return {
    originalAmount,
    taxableAmount: money(taxableAmount, currency),
    taxes,
    totalTax: money(totalTax, currency),
    finalAmount: money(finalAmount, currency),
    discount: {
      type: input.discount.type,
      value: input.discount.value,
      mode,
      amount: money(discountAmount, currency),
    },
  };
}
