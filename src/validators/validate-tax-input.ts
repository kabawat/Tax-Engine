import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import { PricingMode } from '../models/pricing-mode.js';
import type { TaxInput } from '../models/tax-input.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function reject(message: string, code: TaxEngineErrorCode, details?: unknown): never {
  throw new TaxEngineError(message, { code, details });
}

export function validateTaxInput(input: TaxInput): void {
  if (!Number.isFinite(input.amount.amount) || input.amount.amount < 0) {
    reject('Amount must be a non-negative finite number', TaxEngineErrorCode.INVALID_AMOUNT, {
      field: 'amount.amount',
    });
  }

  if (!input.amount.currency.trim()) {
    reject('Currency is required', TaxEngineErrorCode.INVALID_CURRENCY, {
      field: 'amount.currency',
    });
  }

  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    reject('Quantity must be a non-negative finite number', TaxEngineErrorCode.INVALID_TAX_INPUT, {
      field: 'quantity',
    });
  }

  if (!input.item.category.trim()) {
    reject('Item category is required', TaxEngineErrorCode.INVALID_TAX_INPUT, {
      field: 'item.category',
    });
  }

  if (
    input.pricingMode !== PricingMode.INCLUSIVE &&
    input.pricingMode !== PricingMode.EXCLUSIVE
  ) {
    reject('Pricing mode is invalid', TaxEngineErrorCode.INVALID_TAX_INPUT, {
      field: 'pricingMode',
    });
  }

  if (!input.jurisdiction.country.trim()) {
    reject('Jurisdiction country is required', TaxEngineErrorCode.INVALID_JURISDICTION, {
      field: 'jurisdiction.country',
    });
  }

  if (!isValidIsoDate(input.calculationDate)) {
    reject('Calculation date must be a valid ISO date (YYYY-MM-DD)', TaxEngineErrorCode.INVALID_DATE, {
      field: 'calculationDate',
    });
  }
}
