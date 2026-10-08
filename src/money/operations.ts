import { RoundingMode, type CurrencyCode, type Money, type MoneyConfig } from '../models/money.js';

const DEFAULT_PRECISION = 2;

export function resolvePrecision(config?: MoneyConfig): number {
  return config?.defaultPrecision ?? DEFAULT_PRECISION;
}

export function resolveRoundingMode(config?: MoneyConfig): RoundingMode {
  return config?.defaultRoundingMode ?? RoundingMode.HALF_UP;
}

function absDecimalString(value: number): string {
  if (value === 0) {
    return '0';
  }

  let str = Math.abs(value).toString();
  if (!/[eE]/.test(str)) {
    return str;
  }

  const match = /^(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(str);
  if (match === null) {
    return str;
  }

  const coefficient = match[1] ?? '0';
  const exponent = Number(match[2]);
  const [whole, fraction = ''] = coefficient.split('.') as [string, string];
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `0.${'0'.repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  }
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function shouldRoundUp(
  mode: RoundingMode,
  nextDigit: number,
  hasNonZeroRemainder: boolean,
  scaledTruncated: bigint,
): boolean {
  switch (mode) {
    case RoundingMode.DOWN:
      return false;
    case RoundingMode.UP:
      return nextDigit > 0 || hasNonZeroRemainder;
    case RoundingMode.HALF_DOWN:
      return nextDigit > 5 || (nextDigit === 5 && hasNonZeroRemainder);
    case RoundingMode.HALF_EVEN: {
      if (nextDigit > 5 || (nextDigit === 5 && hasNonZeroRemainder)) {
        return true;
      }
      if (nextDigit < 5) {
        return false;
      }
      return scaledTruncated % 2n !== 0n;
    }
    case RoundingMode.HALF_UP:
    default:
      return nextDigit >= 5;
  }
}

// Scale-safe rounding (avoids float * 10^n artifacts)
export function roundAmount(
  value: number,
  precision: number = DEFAULT_PRECISION,
  mode: RoundingMode = RoundingMode.HALF_UP,
): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError('precision must be a non-negative integer');
  }

  const sign = value < 0 ? -1 : 1;
  const absStr = absDecimalString(value);
  const [wholePart, fractionPart = ''] = absStr.split('.') as [string, string];

  if (fractionPart.length <= precision) {
    const normalizedFraction = fractionPart.padEnd(precision, '0');
    if (precision === 0) {
      return sign * Number(wholePart);
    }
    return sign * Number(`${wholePart}.${normalizedFraction}`);
  }

  const kept = fractionPart.slice(0, precision);
  const nextDigit = Number(fractionPart.charAt(precision));
  const remainder = fractionPart.slice(precision + 1);
  const hasNonZeroRemainder = /[1-9]/.test(remainder);

  const factor = 10n ** BigInt(precision);
  let scaled = BigInt(wholePart) * factor + BigInt(kept || '0');

  if (shouldRoundUp(mode, nextDigit, hasNonZeroRemainder, scaled)) {
    scaled += 1n;
  }

  if (precision === 0) {
    return sign * Number(scaled);
  }

  const whole = scaled / factor;
  const frac = scaled % factor;
  return sign * Number(`${whole.toString()}.${frac.toString().padStart(precision, '0')}`);
}

export function money(amount: number, currency: CurrencyCode): Money {
  return { amount, currency };
}

export function roundMoney(value: Money, precision: number, mode?: RoundingMode): Money {
  return {
    amount: roundAmount(value.amount, precision, mode),
    currency: value.currency,
  };
}

export function sumMoneyAmounts(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

export function toMinorUnits(amount: number, precision: number): number {
  return Math.round(roundAmount(amount, precision) * 10 ** precision);
}

export function fromMinorUnits(units: number, precision: number): number {
  if (precision === 0) {
    return units;
  }
  const factor = 10 ** precision;
  const whole = Math.trunc(units / factor);
  const frac = Math.abs(units % factor);
  const sign = units < 0 ? '-' : '';
  return Number(`${sign}${Math.abs(whole)}.${frac.toString().padStart(precision, '0')}`);
}
