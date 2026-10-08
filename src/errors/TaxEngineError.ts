export const TaxEngineErrorCode = {
  INVALID_TAX_INPUT: 'INVALID_TAX_INPUT',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_COUNTRY: 'INVALID_COUNTRY',
  INVALID_TAX_RULE: 'INVALID_TAX_RULE',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  INVALID_JURISDICTION: 'INVALID_JURISDICTION',
  INVALID_DATE: 'INVALID_DATE',
  INVALID_TAX_RATE: 'INVALID_TAX_RATE',
  INVALID_RULE_CONFIGURATION: 'INVALID_RULE_CONFIGURATION',
  NO_RULE_FOUND: 'NO_RULE_FOUND',
  UNSUPPORTED_CASE: 'UNSUPPORTED_CASE',
} as const;

export type TaxEngineErrorCode =
  (typeof TaxEngineErrorCode)[keyof typeof TaxEngineErrorCode];

export interface TaxEngineErrorOptions {
  readonly code: TaxEngineErrorCode;
  readonly details?: unknown;
  readonly cause?: unknown;
}

export class TaxEngineError extends Error {
  readonly code: TaxEngineErrorCode;
  readonly details?: unknown;

  constructor(message: string, options: TaxEngineErrorOptions) {
    super(message);
    this.name = 'TaxEngineError';
    this.code = options.code;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
