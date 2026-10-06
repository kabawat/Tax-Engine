import type { TaxInput } from '../models/tax-input.js';

export interface ValidationIssue {
  readonly field?: string;
  readonly message: string;
  readonly code?: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface TaxInputValidator {
  validate(input: TaxInput): ValidationResult;
}
