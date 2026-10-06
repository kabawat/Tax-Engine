/**
 * ISO 4217 currency code (e.g. "USD", "INR").
 * Kept as string to support any currency without hard-coding a fixed set.
 */
export type CurrencyCode = string;

/**
 * Monetary amount representation.
 *
 * Uses `number` as the interim storage type. The abstraction is intentionally
 * separate from raw primitives used elsewhere so a future phase can swap in
 * Decimal/BigInt-backed values without changing consumer-facing contracts.
 */
export type MoneyAmount = number;

/** Supported rounding strategies for money arithmetic. */
export const RoundingMode = {
  HALF_UP: 'HALF_UP',
  HALF_DOWN: 'HALF_DOWN',
  HALF_EVEN: 'HALF_EVEN',
  UP: 'UP',
  DOWN: 'DOWN',
} as const;

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

/** A monetary value with its currency. */
export interface Money {
  readonly amount: MoneyAmount;
  readonly currency: CurrencyCode;
}

/** Precision and rounding configuration for money operations. */
export interface MoneyScale {
  readonly precision: number;
  readonly roundingMode?: RoundingMode;
}

/** Package-level defaults for money handling. */
export interface MoneyConfig {
  readonly defaultPrecision?: number;
  readonly defaultRoundingMode?: RoundingMode;
}
