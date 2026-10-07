import type { CountryTaxLine } from '../../core/country/types.js';
import { computeDiscountAmount } from '../../discount/compute.js';
import {
  DiscountMode,
  resolveDiscountMode,
  type AppliedDiscount,
  type DiscountInput,
  type DiscountMode as DiscountModeType,
} from '../../discount/types.js';
import { PricingMode } from '../../models/pricing-mode.js';
import type { Money } from '../../models/money.js';
import { RoundingMode } from '../../models/money.js';
import {
  fromMinorUnits,
  money,
  roundAmount,
  sumMoneyAmounts,
  toMinorUnits,
} from '../../money/operations.js';
import type { TaxHeadSpec } from './tax-heads.js';

const PRECISION = 2;

export interface IndiaGstLineAmountsInput {
  readonly amount: number;
  readonly quantity: number;
  readonly currency: string;
  readonly pricingMode: PricingMode;
  readonly totalRatePercent: number;
  readonly heads: readonly TaxHeadSpec[];
  readonly discount?: DiscountInput;
  readonly configDiscountMode?: DiscountModeType;
}

export interface IndiaGstLineAmountsResult {
  readonly originalAmount: Money;
  readonly taxableAmount: Money;
  readonly taxes: readonly CountryTaxLine[];
  readonly totalTax: Money;
  readonly roundingDifference: Money;
  readonly finalAmount: Money;
  readonly discount?: AppliedDiscount;
}

function buildHeads(
  taxableAmount: number,
  heads: readonly TaxHeadSpec[],
  currency: string,
): CountryTaxLine[] {
  return heads.map((head) => ({
    type: head.type,
    rate: head.ratePercent,
    taxableBase: money(taxableAmount, currency),
    amount: money(
      roundAmount((taxableAmount * head.ratePercent) / 100, PRECISION),
      currency,
    ),
    name: head.type,
  }));
}

function roundingDifferenceFrom(
  totalTax: number,
  taxes: readonly CountryTaxLine[],
  currency: string,
): Money {
  const headsSum = roundAmount(
    sumMoneyAmounts(taxes.map((t) => t.amount.amount)),
    PRECISION,
  );
  return money(roundAmount(totalTax - headsSum, PRECISION), currency);
}

function exclusiveOnTaxable(
  taxableAmount: number,
  totalRatePercent: number,
  heads: readonly TaxHeadSpec[],
  currency: string,
  originalAmount: Money,
  finalAmountOverride?: number,
  discount?: AppliedDiscount,
): IndiaGstLineAmountsResult {
  const totalTax = roundAmount((taxableAmount * totalRatePercent) / 100, PRECISION);
  const taxes = buildHeads(taxableAmount, heads, currency);
  const finalAmount =
    finalAmountOverride !== undefined
      ? roundAmount(finalAmountOverride, PRECISION)
      : roundAmount(taxableAmount + totalTax, PRECISION);

  return {
    originalAmount,
    taxableAmount: money(taxableAmount, currency),
    taxes,
    totalTax: money(totalTax, currency),
    roundingDifference: roundingDifferenceFrom(totalTax, taxes, currency),
    finalAmount: money(finalAmount, currency),
    ...(discount !== undefined ? { discount } : {}),
  };
}

// Max taxable such that taxable + round(taxable * R/100) <= gross
function solveInclusiveTaxable(
  gross: number,
  totalRatePercent: number,
): { taxableAmount: number; totalTax: number } {
  if (gross === 0) {
    return { taxableAmount: 0, totalTax: 0 };
  }

  const grossUnits = toMinorUnits(gross, PRECISION);
  let low = 0;
  let high = grossUnits;

  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    const taxable = fromMinorUnits(mid, PRECISION);
    const tax = roundAmount((taxable * totalRatePercent) / 100, PRECISION);
    const final = roundAmount(taxable + tax, PRECISION);
    if (final <= gross) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const taxableAmount = fromMinorUnits(low, PRECISION);
  // Extracted tax so taxable + totalTax equals entered inclusive gross
  const totalTax = roundAmount(gross - taxableAmount, PRECISION);
  return { taxableAmount, totalTax };
}

function zeroTaxResult(
  lineAmount: number,
  currency: string,
  pricingMode: PricingMode,
  discount?: AppliedDiscount,
  finalAmount?: number,
): IndiaGstLineAmountsResult {
  const amount = money(lineAmount, currency);
  const final =
    finalAmount !== undefined
      ? money(roundAmount(finalAmount, PRECISION), currency)
      : amount;
  return {
    originalAmount: amount,
    taxableAmount: amount,
    taxes: [],
    totalTax: money(0, currency),
    roundingDifference: money(0, currency),
    finalAmount: final,
    ...(discount !== undefined ? { discount } : {}),
  };
}

export function calculateIndiaGstLineAmounts(
  input: IndiaGstLineAmountsInput,
): IndiaGstLineAmountsResult {
  const currency = input.currency;
  const lineAmount = roundAmount(input.amount * input.quantity, PRECISION);
  const originalAmount = money(lineAmount, currency);
  const heads = input.heads;
  const R = input.totalRatePercent;

  if (heads.length === 0 || R === 0) {
    if (input.discount === undefined) {
      return zeroTaxResult(lineAmount, currency, input.pricingMode);
    }
  }

  if (input.discount === undefined) {
    if (heads.length === 0 || R === 0) {
      return zeroTaxResult(lineAmount, currency, input.pricingMode);
    }

    if (input.pricingMode === PricingMode.EXCLUSIVE) {
      return exclusiveOnTaxable(lineAmount, R, heads, currency, originalAmount);
    }

    const { taxableAmount, totalTax } = solveInclusiveTaxable(lineAmount, R);
    const taxes = buildHeads(taxableAmount, heads, currency);
    return {
      originalAmount,
      taxableAmount: money(taxableAmount, currency),
      taxes,
      totalTax: money(totalTax, currency),
      roundingDifference: roundingDifferenceFrom(totalTax, taxes, currency),
      finalAmount: money(lineAmount, currency),
    };
  }

  const mode = resolveDiscountMode(input.discount.mode, input.configDiscountMode);

  if (mode === DiscountMode.BEFORE_TAX) {
    let preTaxBase: number;
    if (input.pricingMode === PricingMode.INCLUSIVE && heads.length > 0 && R !== 0) {
      preTaxBase = solveInclusiveTaxable(lineAmount, R).taxableAmount;
    } else {
      preTaxBase = lineAmount;
    }

    const discountAmount = computeDiscountAmount(
      preTaxBase,
      input.discount,
      PRECISION,
      RoundingMode.HALF_UP,
    );
    const taxable = roundAmount(preTaxBase - discountAmount, PRECISION);
    const discount: AppliedDiscount = {
      type: input.discount.type,
      value: input.discount.value,
      mode,
      amount: money(discountAmount, currency),
    };

    if (heads.length === 0 || R === 0) {
      return zeroTaxResult(lineAmount, currency, input.pricingMode, discount, taxable);
    }

    return exclusiveOnTaxable(
      taxable,
      R,
      heads,
      currency,
      originalAmount,
      undefined,
      discount,
    );
  }

  // AFTER_TAX
  let taxed: IndiaGstLineAmountsResult;
  if (heads.length === 0 || R === 0) {
    taxed = zeroTaxResult(lineAmount, currency, input.pricingMode);
  } else if (input.pricingMode === PricingMode.INCLUSIVE) {
    const { taxableAmount, totalTax } = solveInclusiveTaxable(lineAmount, R);
    const taxes = buildHeads(taxableAmount, heads, currency);
    taxed = {
      originalAmount,
      taxableAmount: money(taxableAmount, currency),
      taxes,
      totalTax: money(totalTax, currency),
      roundingDifference: roundingDifferenceFrom(totalTax, taxes, currency),
      finalAmount: money(lineAmount, currency),
    };
  } else {
    taxed = exclusiveOnTaxable(lineAmount, R, heads, currency, originalAmount);
  }

  const discountAmount = computeDiscountAmount(
    taxed.finalAmount.amount,
    input.discount,
    PRECISION,
    RoundingMode.HALF_UP,
  );
  const finalAmount = roundAmount(taxed.finalAmount.amount - discountAmount, PRECISION);

  return {
    ...taxed,
    finalAmount: money(finalAmount, currency),
    discount: {
      type: input.discount.type,
      value: input.discount.value,
      mode,
      amount: money(discountAmount, currency),
    },
  };
}

export function computeRoundingDifference(
  totalTax: Money,
  taxes: readonly CountryTaxLine[],
): Money {
  return roundingDifferenceFrom(totalTax.amount, taxes, totalTax.currency);
}
