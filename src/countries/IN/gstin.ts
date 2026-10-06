import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { GSTIN_STATE_CODES, normalizeIndiaState } from './states.js';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(gstin: string): string {
  return gstin.trim().toUpperCase();
}

export function validateGstinFormat(gstin: string): string {
  const value = normalizeGstin(gstin);
  if (!GSTIN_PATTERN.test(value)) {
    throw new TaxEngineError('Invalid GSTIN format', {
      code: TaxEngineErrorCode.INVALID_INPUT,
      details: { field: 'gstin', gstin },
    });
  }
  return value;
}

// State/UT code from GSTIN prefix
export function resolveStateCodeFromGSTIN(gstin: string): string {
  const value = validateGstinFormat(gstin);
  const digits = value.slice(0, 2);
  const state = GSTIN_STATE_CODES[digits];
  if (state === undefined) {
    throw new TaxEngineError('Invalid GSTIN state code', {
      code: TaxEngineErrorCode.INVALID_INPUT,
      details: { field: 'gstin', stateCode: digits, gstin: value },
    });
  }
  return state;
}

export function hasGstin(gstin: string | undefined): boolean {
  return gstin !== undefined && gstin.trim() !== '';
}
