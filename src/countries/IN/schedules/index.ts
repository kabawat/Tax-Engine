import type { IndiaTaxability } from '../types.js';
import { IndiaTaxability as Taxability } from '../types.js';

export interface IndiaScheduleRatePeriod {
  readonly ratePercent: number;
  readonly taxability: IndiaTaxability;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reverseCharge?: boolean;
}

/** Catalog entry (one code → rate history). */
export interface IndiaScheduleEntry {
  readonly code: string;
  readonly kind: 'HSN' | 'SAC';
  readonly description?: string;
  readonly rateHistory: readonly IndiaScheduleRatePeriod[];
}

/** Date-resolved schedule row used by the calculation engine. */
export interface ResolvedIndiaScheduleEntry {
  readonly code: string;
  readonly kind: 'HSN' | 'SAC';
  readonly description?: string;
  readonly ratePercent: number;
  readonly taxability: IndiaTaxability;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reverseCharge?: boolean;
}

/** O(1) lookup index: key = `${kind}:${code}` → catalog entry. */
export type IndiaScheduleIndex = ReadonlyMap<string, IndiaScheduleEntry>;

export function scheduleLookupKey(kind: 'HSN' | 'SAC', code: string): string {
  return `${kind}:${code.trim()}`;
}

export function isEffectiveRatePeriod(
  period: IndiaScheduleRatePeriod,
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

function compareEffectiveFromDesc(
  a: IndiaScheduleRatePeriod,
  b: IndiaScheduleRatePeriod,
): number {
  return a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0;
}

function sortedRateHistory(
  history: readonly IndiaScheduleRatePeriod[],
): readonly IndiaScheduleRatePeriod[] {
  return [...history].sort(compareEffectiveFromDesc);
}

function pickRatePeriod(
  entry: IndiaScheduleEntry | undefined,
  calculationDate: string,
): ResolvedIndiaScheduleEntry | undefined {
  if (entry === undefined) {
    return undefined;
  }
  for (const period of sortedRateHistory(entry.rateHistory)) {
    if (isEffectiveRatePeriod(period, calculationDate)) {
      return {
        code: entry.code,
        kind: entry.kind,
        ...(entry.description !== undefined ? { description: entry.description } : {}),
        ratePercent: period.ratePercent,
        taxability: period.taxability,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
        ...(period.reverseCharge !== undefined
          ? { reverseCharge: period.reverseCharge }
          : {}),
      };
    }
  }
  return undefined;
}

/** Build Map index from catalog entries (one entry per kind+code). */
export function buildScheduleIndex(
  entries: readonly IndiaScheduleEntry[],
): IndiaScheduleIndex {
  const map = new Map<string, IndiaScheduleEntry>();
  for (const entry of entries) {
    map.set(scheduleLookupKey(entry.kind, entry.code), {
      ...entry,
      rateHistory: sortedRateHistory(entry.rateHistory),
    });
  }
  return map;
}

/** Candidate codes: exact, then HSN parents (8→6→4 and progressive truncate to 4). */
export function hsnLookupCandidates(code: string): readonly string[] {
  const normalized = code.trim();
  const out: string[] = [normalized];
  if (!/^\d+$/.test(normalized)) {
    return out;
  }
  for (const len of [8, 6, 4]) {
    if (normalized.length > len) {
      const prefix = normalized.slice(0, len);
      if (!out.includes(prefix)) {
        out.push(prefix);
      }
    }
  }
  for (let len = normalized.length - 1; len >= 4; len -= 1) {
    const prefix = normalized.slice(0, len);
    if (!out.includes(prefix)) {
      out.push(prefix);
    }
  }
  return out;
}

/**
 * Resolve schedule row by kind+code with O(1) Map lookup.
 * HSN falls back to longer→shorter parent codes when exact code is missing.
 * Picks the rateHistory period effective on calculationDate.
 */
export function resolveScheduleEntry(
  code: string,
  kind: 'HSN' | 'SAC',
  calculationDate: string,
  schedule: IndiaScheduleIndex | readonly IndiaScheduleEntry[] = INDIA_STARTER_SCHEDULE,
): ResolvedIndiaScheduleEntry | undefined {
  const index = Array.isArray(schedule)
    ? buildScheduleIndex(schedule)
    : (schedule as IndiaScheduleIndex);

  if (kind === 'SAC') {
    return pickRatePeriod(index.get(scheduleLookupKey('SAC', code)), calculationDate);
  }

  for (const candidate of hsnLookupCandidates(code)) {
    const hit = pickRatePeriod(index.get(scheduleLookupKey('HSN', candidate)), calculationDate);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

function starterEntry(
  code: string,
  kind: 'HSN' | 'SAC',
  description: string,
  ratePercent: number,
  taxability: IndiaTaxability,
  reverseCharge?: boolean,
): IndiaScheduleEntry {
  return {
    code,
    kind,
    description,
    rateHistory: [
      {
        ratePercent,
        taxability,
        effectiveFrom: '2017-07-01',
        effectiveTo: null,
        ...(reverseCharge !== undefined ? { reverseCharge } : {}),
      },
    ],
  };
}

/** Small built-in starter set (default for `new Tax('IN')` — keeps core package light). */
export const INDIA_STARTER_SCHEDULE: readonly IndiaScheduleEntry[] = [
  starterEntry('8471', 'HSN', 'Automatic data processing machines', 18, Taxability.TAXABLE),
  starterEntry('1001', 'HSN', 'Wheat and meslin', 0, Taxability.NIL_RATED),
  starterEntry('4901', 'HSN', 'Printed books', 0, Taxability.EXEMPT),
  starterEntry('2203', 'HSN', 'Beer made from malt', 0, Taxability.NON_GST),
  starterEntry('0401', 'HSN', 'Zero-rated sample', 0, Taxability.ZERO_RATED),
  starterEntry('998314', 'SAC', 'IT consulting', 18, Taxability.TAXABLE),
  starterEntry('996511', 'SAC', 'Road transport of goods', 5, Taxability.TAXABLE),
  starterEntry('999799', 'SAC', 'Sample RCM service', 18, Taxability.TAXABLE, true),
];

export const INDIA_STARTER_SCHEDULE_INDEX: IndiaScheduleIndex =
  buildScheduleIndex(INDIA_STARTER_SCHEDULE);
