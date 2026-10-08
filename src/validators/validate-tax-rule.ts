import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import type { TaxRule } from '../models/tax-rule.js';
import { TaxRateBasis } from '../models/tax-rule.js';

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

export function validateTaxRule(rule: TaxRule): void {
  if (!rule.id.trim()) {
    reject('Rule ID is required', TaxEngineErrorCode.INVALID_TAX_RULE, { field: 'id' });
  }

  if (!rule.name.trim()) {
    reject('Rule name is required', TaxEngineErrorCode.INVALID_TAX_RULE, { field: 'name' });
  }

  if (!rule.taxType.toString().trim()) {
    reject('Tax type is required', TaxEngineErrorCode.INVALID_TAX_RULE, {
      field: 'taxType',
      ruleId: rule.id,
    });
  }

  if (!rule.category.trim()) {
    reject('Tax category is required', TaxEngineErrorCode.INVALID_TAX_RULE, {
      field: 'category',
      ruleId: rule.id,
    });
  }

  if (!Number.isFinite(rule.rate.value) || rule.rate.value < 0) {
    reject('Tax rate value must be a non-negative number', TaxEngineErrorCode.INVALID_TAX_RATE, {
      field: 'rate.value',
    });
  }

  if (rule.rate.basis === TaxRateBasis.PERCENTAGE && rule.rate.value > 100) {
    reject('Percentage tax rate cannot exceed 100', TaxEngineErrorCode.INVALID_TAX_RATE, {
      field: 'rate.value',
    });
  }

  if (!rule.jurisdiction.country.trim()) {
    reject('Jurisdiction country is required', TaxEngineErrorCode.INVALID_JURISDICTION, {
      field: 'jurisdiction.country',
    });
  }

  if (!isValidIsoDate(rule.effective.effectiveFrom)) {
    reject('Effective from date must be a valid ISO date (YYYY-MM-DD)', TaxEngineErrorCode.INVALID_DATE, {
      field: 'effective.effectiveFrom',
    });
  }

  if (rule.effective.effectiveUntil !== undefined) {
    if (!isValidIsoDate(rule.effective.effectiveUntil)) {
      reject('Effective until date must be a valid ISO date (YYYY-MM-DD)', TaxEngineErrorCode.INVALID_DATE, {
        field: 'effective.effectiveUntil',
      });
    }
    if (rule.effective.effectiveUntil < rule.effective.effectiveFrom) {
      reject('Effective until date cannot be before effective from date', TaxEngineErrorCode.INVALID_DATE);
    }
  }

  if (!Number.isFinite(rule.priority)) {
    reject('Priority must be a finite number', TaxEngineErrorCode.INVALID_RULE_CONFIGURATION, {
      field: 'priority',
    });
  }

  if (rule.compound.isCompound && rule.taxableBase.includePreviousTaxes !== true) {
    reject(
      'Compound rules must set taxableBase.includePreviousTaxes to true',
      TaxEngineErrorCode.INVALID_RULE_CONFIGURATION,
      { ruleId: rule.id },
    );
  }
}
