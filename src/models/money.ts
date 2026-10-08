// ISO 4217 currency code
export type CurrencyCode = string;

// Monetary amount (number storage)
export type MoneyAmount = number;

// Rounding strategies for money arithmetic
export const RoundingMode = {
  HALF_UP: 'HALF_UP',
  HALF_DOWN: 'HALF_DOWN',
  HALF_EVEN: 'HALF_EVEN',
  UP: 'UP',
  DOWN: 'DOWN',
} as const;

export type RoundingMode = (typeof RoundingMode)[keyof typeof RoundingMode];

export interface Money {
  readonly amount: MoneyAmount;
  readonly currency: CurrencyCode;
}

export interface MoneyScale {
  readonly precision: number;
  readonly roundingMode?: RoundingMode;
}

export interface MoneyConfig {
  readonly defaultPrecision?: number;
  readonly defaultRoundingMode?: RoundingMode;
}
