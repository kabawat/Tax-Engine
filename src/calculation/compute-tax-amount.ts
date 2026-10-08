import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import type { RoundingMode } from '../models/money.js';
import type { TaxRate } from '../models/tax-rule.js';
import { TaxRateBasis } from '../models/tax-rule.js';
import { roundAmount } from '../money/operations.js';

export function computeTaxAmount(
  taxableBase: number,
  rate: TaxRate,
  precision: number,
  roundingMode?: RoundingMode,
): number {
  if (!Number.isFinite(rate.value) || rate.value < 0) {
    throw new TaxEngineError('Tax rate value must be a non-negative finite number', {
      code: TaxEngineErrorCode.INVALID_TAX_RATE,
      details: { field: 'rate.value' },
    });
  }

  if (rate.basis === TaxRateBasis.PERCENTAGE) {
    return roundAmount((taxableBase * rate.value) / 100, precision, roundingMode);
  }

  if (rate.basis === TaxRateBasis.FIXED) {
    return roundAmount(rate.value, precision, roundingMode);
  }

  throw new TaxEngineError('Unsupported tax rate basis', {
    code: TaxEngineErrorCode.INVALID_TAX_RATE,
    details: { field: 'rate.basis' },
  });
}
