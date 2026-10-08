import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { GSTIN_STATE_CODES } from './states.js';

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// PAN 4th character (GSTIN index 5) → entity constitution code
const ENTITY_BY_PAN_TYPE: Readonly<Record<string, string>> = {
  P: 'INDIVIDUAL',
  C: 'COMPANY',
  H: 'HUF',
  F: 'FIRM',
  A: 'AOP',
  T: 'TRUST',
  B: 'BOI',
  L: 'LOCAL_AUTHORITY',
  J: 'ARTIFICIAL_JURIDICAL_PERSON',
  G: 'GOVERNMENT',
};

export interface ParsedGstin {
  readonly gstin: string;
  readonly valid: true;
  readonly stateCode: string; // 2-digit GSTIN prefix
  readonly state: string; // KA, MH, …
  readonly pan: string;
  readonly entityCode: string; // PAN 4th char
  readonly entityType: string | undefined;
  readonly registrationNumber: string; // 13th char (entity serial in state)
  readonly defaultChar: string; // always Z when valid
  readonly checksum: string;
}

function reject(message: string, details?: Record<string, unknown>): never {
  throw new TaxEngineError(message, {
    code: TaxEngineErrorCode.INVALID_INPUT,
    details: { field: 'gstin', ...details },
  });
}

export function normalizeGstin(gstin: string): string {
  return gstin.trim().toUpperCase();
}

// Luhn mod-36 check character over the first 14 GSTIN characters
export function gstinChecksumDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_CHARSET.indexOf(first14.charAt(i));
    if (value < 0) {
      reject('Invalid GSTIN character for checksum', { gstin: first14 });
    }
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36]!;
}

export function hasGstin(gstin: string | undefined): boolean {
  return gstin !== undefined && gstin.trim() !== '';
}

/** @deprecated Prefer validateGSTIN */
export function validateGstinFormat(gstin: string): string {
  return validateGSTIN(gstin);
}

// Normalize, format, state code, and checksum; returns normalized GSTIN
export function validateGSTIN(gstin: string): string {
  if (typeof gstin !== 'string') {
    reject('GSTIN must be a string', { gstin });
  }

  const value = normalizeGstin(gstin);
  if (!value) {
    reject('GSTIN is required', { gstin });
  }
  if (value.length !== 15) {
    reject('GSTIN must be exactly 15 characters', { gstin: value, length: value.length });
  }
  if (!/^[0-9A-Z]+$/.test(value)) {
    reject('GSTIN contains invalid characters', { gstin: value });
  }
  if (!GSTIN_PATTERN.test(value)) {
    reject('Invalid GSTIN format', { gstin: value });
  }

  const stateDigits = value.slice(0, 2);
  if (GSTIN_STATE_CODES[stateDigits] === undefined) {
    reject('Invalid GSTIN state code', { gstin: value, stateCode: stateDigits });
  }

  const expected = gstinChecksumDigit(value.slice(0, 14));
  if (value.charAt(14) !== expected) {
    reject('Invalid GSTIN checksum', {
      gstin: value,
      expectedChecksum: expected,
      actualChecksum: value.charAt(14),
    });
  }

  return value;
}

export function parseGSTIN(gstin: string): ParsedGstin {
  const value = validateGSTIN(gstin);
  const stateCode = value.slice(0, 2);
  const pan = value.slice(2, 12);
  const entityCode = pan.charAt(3);
  const state = GSTIN_STATE_CODES[stateCode]!;

  return {
    gstin: value,
    valid: true,
    stateCode,
    state,
    pan,
    entityCode,
    entityType: ENTITY_BY_PAN_TYPE[entityCode],
    registrationNumber: value.charAt(12),
    defaultChar: value.charAt(13),
    checksum: value.charAt(14),
  };
}

export function getStateFromGSTIN(gstin: string): string {
  return parseGSTIN(gstin).state;
}

/** @deprecated Prefer getStateFromGSTIN */
export function resolveStateCodeFromGSTIN(gstin: string): string {
  return getStateFromGSTIN(gstin);
}

export function isValidGSTIN(gstin: string): boolean {
  try {
    validateGSTIN(gstin);
    return true;
  } catch {
    return false;
  }
}

export function stateFromGstinDigits(gstin: string): string | undefined {
  const code = normalizeGstin(gstin).slice(0, 2);
  return GSTIN_STATE_CODES[code];
}
