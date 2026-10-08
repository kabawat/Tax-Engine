import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';

// Minimal period shape for integrity + date matching
export interface RateHistoryPeriod {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_ENDED = '9999-12-31';

export type RateHistoryDetails = {
  readonly kind?: 'HSN' | 'SAC';
  readonly code?: string;
};

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function reject(
  message: string,
  details?: RateHistoryDetails & Record<string, unknown>,
): never {
  throw new TaxEngineError(message, {
    code: TaxEngineErrorCode.INVALID_INPUT,
    details,
  });
}

function compareEffectiveFromAsc(
  a: RateHistoryPeriod,
  b: RateHistoryPeriod,
): number {
  if (a.effectiveFrom < b.effectiveFrom) return -1;
  if (a.effectiveFrom > b.effectiveFrom) return 1;
  return 0;
}

export function compareEffectiveFromDesc(
  a: RateHistoryPeriod,
  b: RateHistoryPeriod,
): number {
  return compareEffectiveFromAsc(b, a);
}

function periodEnd(period: RateHistoryPeriod): string {
  return period.effectiveTo ?? OPEN_ENDED;
}

function periodsOverlap(a: RateHistoryPeriod, b: RateHistoryPeriod): boolean {
  return a.effectiveFrom <= periodEnd(b) && b.effectiveFrom <= periodEnd(a);
}

function assertPeriodDates(
  period: RateHistoryPeriod,
  details?: RateHistoryDetails,
): void {
  if (!isIsoDate(period.effectiveFrom)) {
    reject('rateHistory effectiveFrom must be a valid ISO date', {
      ...details,
      effectiveFrom: period.effectiveFrom,
    });
  }

  if (period.effectiveTo === null) {
    return;
  }

  if (!isIsoDate(period.effectiveTo)) {
    reject('rateHistory effectiveTo must be a valid ISO date or null', {
      ...details,
      effectiveTo: period.effectiveTo,
    });
  }

  if (period.effectiveFrom > period.effectiveTo) {
    reject('rateHistory effectiveFrom must be <= effectiveTo', {
      ...details,
      effectiveFrom: period.effectiveFrom,
      effectiveTo: period.effectiveTo,
    });
  }
}

function assertNoOverlapsOrDuplicates(
  history: readonly RateHistoryPeriod[],
  details?: RateHistoryDetails,
): void {
  const sorted = [...history].sort(compareEffectiveFromAsc);

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;

    if (prev.effectiveFrom === curr.effectiveFrom) {
      reject('rateHistory has duplicate effectiveFrom', {
        ...details,
        effectiveFrom: curr.effectiveFrom,
      });
    }

    if (periodsOverlap(prev, curr)) {
      reject('rateHistory periods overlap', {
        ...details,
        left: {
          effectiveFrom: prev.effectiveFrom,
          effectiveTo: prev.effectiveTo,
        },
        right: {
          effectiveFrom: curr.effectiveFrom,
          effectiveTo: curr.effectiveTo,
        },
      });
    }
  }
}

// Validates non-empty history, ISO dates, from<=to, no duplicates, no overlaps
export function assertRateHistoryIntegrity(
  history: readonly RateHistoryPeriod[],
  details?: RateHistoryDetails,
): void {
  if (!Array.isArray(history) || history.length === 0) {
    reject('rateHistory must be a non-empty array', details);
  }

  for (const period of history) {
    assertPeriodDates(period, details);
  }

  assertNoOverlapsOrDuplicates(history, details);
}

export function sortedRateHistoryDesc<T extends RateHistoryPeriod>(
  history: readonly T[],
): readonly T[] {
  return [...history].sort(compareEffectiveFromDesc);
}

export function isEffectiveRatePeriod(
  period: RateHistoryPeriod,
  calculationDate: string,
): boolean {
  if (calculationDate < period.effectiveFrom) {
    return false;
  }
  if (period.effectiveTo !== null && calculationDate > period.effectiveTo) {
    return false;
  }
  return true;
}
