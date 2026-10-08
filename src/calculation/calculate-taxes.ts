import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import { PricingMode } from '../models/pricing-mode.js';
import type { TaxInput } from '../models/tax-input.js';
import type { TaxLineItem, TaxResult } from '../models/tax-output.js';
import type { TaxRule } from '../models/tax-rule.js';
import type { MoneyConfig, RoundingMode } from '../models/money.js';
import { computeTaxAmount } from './compute-tax-amount.js';
import {
  fromMinorUnits,
  money,
  resolvePrecision,
  resolveRoundingMode,
  roundAmount,
  roundMoney,
  toMinorUnits,
} from '../money/operations.js';

interface ExclusiveCalculation {
  readonly taxableAmount: number;
  readonly taxes: readonly TaxLineItem[];
  readonly totalTax: number;
  readonly finalAmount: number;
}

function usesPreviousTaxes(rule: TaxRule): boolean {
  return rule.taxableBase.includePreviousTaxes === true;
}

function calculateExclusiveOnBase(
  taxableBase: number,
  rules: readonly TaxRule[],
  currency: string,
  precision: number,
  roundingMode: RoundingMode,
): ExclusiveCalculation {
  let accumulatedTax = 0;
  const taxes: TaxLineItem[] = [];

  for (const rule of rules) {
    const ruleBase = usesPreviousTaxes(rule)
      ? roundAmount(taxableBase + accumulatedTax, precision, roundingMode)
      : roundAmount(taxableBase, precision, roundingMode);
    const taxAmount = computeTaxAmount(ruleBase, rule.rate, precision, roundingMode);

    taxes.push({
      ruleId: rule.id,
      taxName: rule.name,
      taxType: rule.taxType,
      rate: rule.rate,
      taxableBase: money(ruleBase, currency),
      taxAmount: money(taxAmount, currency),
      isCompound: rule.compound.isCompound,
    });

    accumulatedTax = roundAmount(accumulatedTax + taxAmount, precision, roundingMode);
  }

  const roundedBase = roundAmount(taxableBase, precision, roundingMode);
  const totalTax = roundAmount(accumulatedTax, precision, roundingMode);
  const finalAmount = roundAmount(roundedBase + totalTax, precision, roundingMode);

  return {
    taxableAmount: roundedBase,
    taxes,
    totalTax,
    finalAmount,
  };
}

function solveTaxableBaseFromGross(
  gross: number,
  rules: readonly TaxRule[],
  currency: string,
  precision: number,
  roundingMode: RoundingMode,
): number {
  const atZero = calculateExclusiveOnBase(0, rules, currency, precision, roundingMode);
  if (atZero.finalAmount > gross) {
    throw new TaxEngineError(
      'Inclusive amount cannot cover applicable fixed or minimum taxes after rounding',
      {
        code: TaxEngineErrorCode.INVALID_AMOUNT,
        details: {
          field: 'amount.amount',
          gross,
          minimumFinalAmount: atZero.finalAmount,
        },
      },
    );
  }
  if (atZero.finalAmount === gross) {
    return 0;
  }

  const grossUnits = toMinorUnits(gross, precision);
  let low = 0;
  let high = grossUnits;

  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    const base = fromMinorUnits(mid, precision);
    const { finalAmount } = calculateExclusiveOnBase(
      base,
      rules,
      currency,
      precision,
      roundingMode,
    );
    if (finalAmount <= gross) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const candidates = [low];
  if (low + 1 <= grossUnits) {
    candidates.push(low + 1);
  }
  if (low > 0) {
    candidates.push(low - 1);
  }

  for (const units of candidates) {
    const base = fromMinorUnits(units, precision);
    const { finalAmount } = calculateExclusiveOnBase(
      base,
      rules,
      currency,
      precision,
      roundingMode,
    );
    if (finalAmount === gross) {
      return base;
    }
  }

  throw new TaxEngineError(
    'Inclusive amount cannot be expressed with rate-consistent tax lines after rounding',
    {
      code: TaxEngineErrorCode.INVALID_AMOUNT,
      details: {
        field: 'amount.amount',
        gross,
        nearestTaxableBase: fromMinorUnits(low, precision),
        nearestFinalAmount: calculateExclusiveOnBase(
          fromMinorUnits(low, precision),
          rules,
          currency,
          precision,
          roundingMode,
        ).finalAmount,
      },
    },
  );
}

export function calculateTaxes(
  input: TaxInput,
  rules: readonly TaxRule[],
  moneyConfig?: MoneyConfig,
): TaxResult {
  const precision = resolvePrecision(moneyConfig);
  const roundingMode = resolveRoundingMode(moneyConfig);
  const currency = input.amount.currency;
  const lineAmount = roundAmount(
    input.amount.amount * input.quantity,
    precision,
    roundingMode,
  );
  const originalAmount = money(lineAmount, currency);

  if (rules.length === 0) {
    return {
      originalAmount,
      taxableAmount: originalAmount,
      currency,
      pricingMode: input.pricingMode,
      taxes: [],
      totalTax: money(0, currency),
      finalAmount: originalAmount,
    };
  }

  let calculation: ExclusiveCalculation;

  if (input.pricingMode === PricingMode.EXCLUSIVE) {
    calculation = calculateExclusiveOnBase(
      lineAmount,
      rules,
      currency,
      precision,
      roundingMode,
    );
  } else {
    const taxableBase = solveTaxableBaseFromGross(
      lineAmount,
      rules,
      currency,
      precision,
      roundingMode,
    );
    calculation = calculateExclusiveOnBase(
      taxableBase,
      rules,
      currency,
      precision,
      roundingMode,
    );
  }

  return {
    originalAmount,
    taxableAmount: money(calculation.taxableAmount, currency),
    currency,
    pricingMode: input.pricingMode,
    taxes: calculation.taxes,
    totalTax: roundMoney(money(calculation.totalTax, currency), precision, roundingMode),
    finalAmount: money(calculation.finalAmount, currency),
  };
}
