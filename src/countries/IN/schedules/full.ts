import { buildScheduleIndex, type IndiaScheduleIndex } from './index.js';
import {
  INDIA_FULL_SCHEDULE,
  INDIA_FULL_SCHEDULE_META,
} from './bundle.js';

export type { IndiaFullScheduleMeta } from './schedule-meta.js';
export { INDIA_FULL_SCHEDULE, INDIA_FULL_SCHEDULE_META };

/** Pre-built Map index for O(1) resolve (merged from chapter JSON files). */
export const INDIA_FULL_SCHEDULE_INDEX: IndiaScheduleIndex =
  buildScheduleIndex(INDIA_FULL_SCHEDULE);
