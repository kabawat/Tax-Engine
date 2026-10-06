import type { IndiaTaxability } from '../types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';

export interface IndiaScheduleRatePeriod {
  readonly ratePercent: number;
  readonly taxability: IndiaTaxability;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reverseCharge?: boolean;
}

// One HSN/SAC code → rate history
export interface IndiaScheduleEntry {
  readonly code: string;
  readonly kind: 'HSN' | 'SAC';
  readonly description?: string;
  readonly rateHistory: readonly IndiaScheduleRatePeriod[];
}

// Schedule row resolved for a calculation date
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

// O(1) index: `${kind}:${code}` → entry (Map or lazy shards)
export interface IndiaScheduleIndex {
  readonly size: number;
  get(key: string): IndiaScheduleEntry | undefined;
  has(key: string): boolean;
  forEach(
    callbackfn: (value: IndiaScheduleEntry, key: string, map: IndiaScheduleIndex) => void,
    thisArg?: unknown,
  ): void;
  entries(): IterableIterator<[string, IndiaScheduleEntry]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<IndiaScheduleEntry>;
  [Symbol.iterator](): IterableIterator<[string, IndiaScheduleEntry]>;
}

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

// Build Map index from catalog entries
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

// Exact code, then parents (8→6→4… / length-1 down to 4) — shared by HSN + SAC
export function scheduleLookupCandidates(code: string): readonly string[] {
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

export function hsnLookupCandidates(code: string): readonly string[] {
  return scheduleLookupCandidates(code);
}

export function sacLookupCandidates(code: string): readonly string[] {
  return scheduleLookupCandidates(code);
}

// Resolve by kind+code; falls back to parent codes (HSN + SAC)
export function resolveScheduleEntry(
  code: string,
  kind: 'HSN' | 'SAC',
  calculationDate: string,
  schedule: IndiaScheduleIndex | readonly IndiaScheduleEntry[],
): ResolvedIndiaScheduleEntry | undefined {
  const index = Array.isArray(schedule)
    ? buildScheduleIndex(schedule)
    : (schedule as IndiaScheduleIndex);

  for (const candidate of scheduleLookupCandidates(code)) {
    const hit = pickRatePeriod(index.get(scheduleLookupKey(kind, candidate)), calculationDate);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

export interface PickIndiaScheduleCodes {
  readonly hsn?: readonly string[];
  readonly sac?: readonly string[];
}

function findScheduleEntry(
  schedule: IndiaScheduleIndex,
  kind: 'HSN' | 'SAC',
  code: string,
): IndiaScheduleEntry | undefined {
  for (const candidate of scheduleLookupCandidates(code)) {
    const hit = schedule.get(scheduleLookupKey(kind, candidate));
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

// Subset full schedule by HSN/SAC codes (no filter → full schedule)
export function pickIndiaSchedule(
  fullSchedule: IndiaScheduleIndex,
  codes: PickIndiaScheduleCodes = {},
): IndiaScheduleIndex {
  const { hsn, sac } = codes;
  if (hsn === undefined && sac === undefined) {
    return fullSchedule;
  }

  const out = new Map<string, IndiaScheduleEntry>();

  if (hsn !== undefined) {
    for (const raw of hsn) {
      const entry = findScheduleEntry(fullSchedule, 'HSN', raw);
      if (entry === undefined) {
        throw new TaxEngineError(`Unknown HSN code: ${raw.trim()}`, {
          code: TaxEngineErrorCode.NO_RULE_FOUND,
          details: { kind: 'HSN', code: raw.trim() },
        });
      }
      out.set(scheduleLookupKey('HSN', entry.code), entry);
    }
  }

  if (sac !== undefined) {
    for (const raw of sac) {
      const entry = findScheduleEntry(fullSchedule, 'SAC', raw);
      if (entry === undefined) {
        throw new TaxEngineError(`Unknown SAC code: ${raw.trim()}`, {
          code: TaxEngineErrorCode.NO_RULE_FOUND,
          details: { kind: 'SAC', code: raw.trim() },
        });
      }
      out.set(scheduleLookupKey('SAC', entry.code), entry);
    }
  }

  return out;
}
