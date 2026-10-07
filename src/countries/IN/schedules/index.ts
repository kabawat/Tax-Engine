import type { IndiaTaxability } from '../types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';
import {
  assertRateHistoryIntegrity,
  isEffectiveRatePeriod,
  sortedRateHistoryDesc,
} from './rate-history.js';

export {
  assertRateHistoryIntegrity,
  isEffectiveRatePeriod,
} from './rate-history.js';

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

// O(1) index: kind:code → entry (Map or lazy shards)
export interface IndiaScheduleIndex {
  readonly size: number;
  get(key: string): IndiaScheduleEntry | undefined;
  has(key: string): boolean;
  forEach(
    callbackfn: (
      value: IndiaScheduleEntry,
      key: string,
      map: IndiaScheduleIndex,
    ) => void,
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

function toResolvedEntry(
  entry: IndiaScheduleEntry,
  period: IndiaScheduleRatePeriod,
): ResolvedIndiaScheduleEntry {
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

function pickRatePeriod(
  entry: IndiaScheduleEntry | undefined,
  calculationDate: string,
): ResolvedIndiaScheduleEntry | undefined {
  if (entry === undefined) {
    return undefined;
  }

  for (const period of sortedRateHistoryDesc(entry.rateHistory)) {
    if (isEffectiveRatePeriod(period, calculationDate)) {
      return toResolvedEntry(entry, period);
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
    assertRateHistoryIntegrity(entry.rateHistory, {
      kind: entry.kind,
      code: entry.code,
    });
    map.set(scheduleLookupKey(entry.kind, entry.code), {
      ...entry,
      rateHistory: sortedRateHistoryDesc(entry.rateHistory),
    });
  }

  return map;
}

// Exact code, then parents (8→6→4… / length-1 down to 4); shared by HSN + SAC
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

// Resolve by kind+code. Parent fallback only if child entry is missing.
// If child exists but date misses, returns undefined (no parent rate inherit).
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
    const entry = index.get(scheduleLookupKey(kind, candidate));
    if (entry === undefined) {
      continue;
    }
    return pickRatePeriod(entry, calculationDate);
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

function requireScheduleEntry(
  schedule: IndiaScheduleIndex,
  kind: 'HSN' | 'SAC',
  code: string,
): IndiaScheduleEntry {
  const entry = findScheduleEntry(schedule, kind, code);
  if (entry === undefined) {
    throw new TaxEngineError(`Unknown ${kind} code: ${code.trim()}`, {
      code: TaxEngineErrorCode.NO_RULE_FOUND,
      details: { kind, code: code.trim() },
    });
  }
  return entry;
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
      const entry = requireScheduleEntry(fullSchedule, 'HSN', raw);
      out.set(scheduleLookupKey('HSN', entry.code), entry);
    }
  }

  if (sac !== undefined) {
    for (const raw of sac) {
      const entry = requireScheduleEntry(fullSchedule, 'SAC', raw);
      out.set(scheduleLookupKey('SAC', entry.code), entry);
    }
  }

  return out;
}
