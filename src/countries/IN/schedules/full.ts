import type { IndiaScheduleEntry, IndiaScheduleIndex } from './index.js';
import {
  LazyIndiaScheduleIndex,
  resetIndiaScheduleShardCache,
  getLoadedShardIds,
  preloadIndiaScheduleShard,
  shardIdForLookupKey,
} from './lazy-index.js';
import {
  INDIA_FULL_SCHEDULE_META,
  INDIA_SCHEDULE_INTEGRITY,
} from './generated/meta.js';

export type { IndiaFullScheduleMeta } from './schedule-meta.js';
export { INDIA_FULL_SCHEDULE_META, INDIA_SCHEDULE_INTEGRITY };
export {
  resetIndiaScheduleShardCache,
  getLoadedShardIds,
  preloadIndiaScheduleShard,
  shardIdForLookupKey,
};

// Default lazy index for new Tax('IN')
const lazyFullScheduleIndex = new LazyIndiaScheduleIndex();
export const INDIA_FULL_SCHEDULE_INDEX: IndiaScheduleIndex = lazyFullScheduleIndex;

let materialisedSchedule: IndiaScheduleEntry[] | undefined;

function materialiseFullSchedule(): IndiaScheduleEntry[] {
  if (materialisedSchedule === undefined) {
    materialisedSchedule = lazyFullScheduleIndex.toArray();
  }
  return materialisedSchedule;
}

// Full array; materialises all shards on first access
export const INDIA_FULL_SCHEDULE: readonly IndiaScheduleEntry[] = new Proxy(
  [] as IndiaScheduleEntry[],
  {
    get(_target, prop) {
      const arr = materialiseFullSchedule();
      const value = Reflect.get(arr, prop, arr);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(arr)
        : value;
    },
    has(_target, prop) {
      return Reflect.has(materialiseFullSchedule(), prop);
    },
    ownKeys() {
      return Reflect.ownKeys(materialiseFullSchedule());
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Object.getOwnPropertyDescriptor(materialiseFullSchedule(), prop);
    },
    getPrototypeOf() {
      return Array.prototype;
    },
  },
);

// Test helper: clear shard + array caches
export function resetIndiaFullScheduleCaches(): void {
  materialisedSchedule = undefined;
  resetIndiaScheduleShardCache();
}
