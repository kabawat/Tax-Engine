import type { TaxInput } from '../models/tax-input.js';

/** A single validation issue reported by a validator. */
export interface ValidationIssue {
  readonly field?: string;
  readonly message: string;
  readonly code?: string;
}

/** Outcome of a validation pass. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Contract for tax input validation. */
export interface TaxInputValidator {
  validate(input: TaxInput): ValidationResult;
}
