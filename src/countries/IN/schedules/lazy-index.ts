import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { IndiaScheduleEntry, IndiaScheduleRatePeriod } from './index.js';
import { scheduleLookupKey } from './index.js';
import { sortedRateHistoryDesc } from './rate-history.js';
import {
  INDIA_SCHEDULE_INTEGRITY,
  INDIA_SCHEDULE_SHARD_IDS,
} from './generated/meta.js';

const require = createRequire(import.meta.url);
const SHARDS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'generated',
  'shards',
);

// Compact: [rate, taxability, from, to, reverseCharge?, cessRatePercent?]
type CompactRate = readonly [
  ratePercent: number,
  taxability: IndiaScheduleRatePeriod['taxability'],
  effectiveFrom: string,
  effectiveTo: string | null,
  reverseCharge?: boolean | null,
  cessRatePercent?: number | null,
];

type CompactRow = readonly [
  code: string,
  description: string | null,
  rates: readonly CompactRate[],
];

interface CompactShard {
  readonly id: string;
  readonly kind: 'HSN' | 'SAC';
  readonly rows: readonly CompactRow[];
}

const shardCache = new Map<string, Map<string, IndiaScheduleEntry>>();
const shardLoadState = new Map<string, 'loading' | 'ready'>();
const SHARD_ID_SET = new Set<string>(INDIA_SCHEDULE_SHARD_IDS);

function inflateRate(rate: CompactRate): IndiaScheduleRatePeriod {
  const period: IndiaScheduleRatePeriod = {
    ratePercent: rate[0],
    taxability: rate[1],
    effectiveFrom: rate[2],
    effectiveTo: rate[3],
  };
  const withFlags: IndiaScheduleRatePeriod = { ...period };
  if (rate.length >= 5 && (rate[4] === true || rate[4] === false)) {
    Object.assign(withFlags, { reverseCharge: rate[4] });
  }
  if (rate.length >= 6 && typeof rate[5] === 'number') {
    Object.assign(withFlags, { cessRatePercent: rate[5] });
  }
  return withFlags;
}

function inflateRow(kind: 'HSN' | 'SAC', row: CompactRow): IndiaScheduleEntry {
  const [code, description, rates] = row;
  return {
    code,
    kind,
    ...(description !== null ? { description } : {}),
    rateHistory: sortedRateHistoryDesc(rates.map(inflateRate)),
  };
}

function loadShard(shardId: string): Map<string, IndiaScheduleEntry> {
  const cached = shardCache.get(shardId);
  if (cached !== undefined) {
    return cached;
  }

  if (!SHARD_ID_SET.has(shardId)) {
    const empty = new Map<string, IndiaScheduleEntry>();
    shardCache.set(shardId, empty);
    return empty;
  }

  if (shardLoadState.get(shardId) === 'loading') {
    const again = shardCache.get(shardId);
    if (again !== undefined) {
      return again;
    }
  }

  shardLoadState.set(shardId, 'loading');
  const filePath = path.join(SHARDS_DIR, `${shardId}.cjs`);
  const mod = require(filePath) as CompactShard;
  const map = new Map<string, IndiaScheduleEntry>();
  for (const row of mod.rows) {
    const entry = inflateRow(mod.kind, row);
    map.set(scheduleLookupKey(entry.kind, entry.code), entry);
  }
  shardCache.set(shardId, map);
  shardLoadState.set(shardId, 'ready');
  return map;
}

export function shardIdForLookupKey(key: string): string | undefined {
  if (key.startsWith('SAC:')) {
    const code = key.slice(4).trim();
    if (code.length < 4 || !/^\d{4}/.test(code)) {
      return undefined;
    }
    return `sac-${code.slice(0, 4)}`;
  }
  if (key.startsWith('HSN:')) {
    const code = key.slice(4).trim();
    if (code.length < 2 || !/^\d/.test(code)) {
      return undefined;
    }
    return `hsn-${code.slice(0, 2)}`;
  }
  return undefined;
}

export function getLoadedShardIds(): readonly string[] {
  return [...shardCache.keys()].filter((id) => {
    const map = shardCache.get(id);
    return map !== undefined && map.size > 0;
  });
}

export function resetIndiaScheduleShardCache(): void {
  shardCache.clear();
  shardLoadState.clear();
}

export function preloadIndiaScheduleShard(shardId: string): void {
  loadShard(shardId);
}

// Lazy Map-like index; loads one shard on demand
export class LazyIndiaScheduleIndex {
  readonly size: number;

  constructor(size = INDIA_SCHEDULE_INTEGRITY.generatedRecordCount) {
    this.size = size;
  }

  get(key: string): IndiaScheduleEntry | undefined {
    const shardId = shardIdForLookupKey(key);
    if (shardId === undefined) {
      return undefined;
    }
    return loadShard(shardId).get(key);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  forEach(
    callbackfn: (
      value: IndiaScheduleEntry,
      key: string,
      map: LazyIndiaScheduleIndex,
    ) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.entries()) {
      callbackfn.call(thisArg, value, key, this);
    }
  }

  *entries(): IterableIterator<[string, IndiaScheduleEntry]> {
    for (const shardId of INDIA_SCHEDULE_SHARD_IDS) {
      yield* loadShard(shardId).entries();
    }
  }

  *keys(): IterableIterator<string> {
    for (const [key] of this.entries()) {
      yield key;
    }
  }

  *values(): IterableIterator<IndiaScheduleEntry> {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  [Symbol.iterator](): IterableIterator<[string, IndiaScheduleEntry]> {
    return this.entries();
  }

  toArray(): IndiaScheduleEntry[] {
    return [...this.values()];
  }
}
