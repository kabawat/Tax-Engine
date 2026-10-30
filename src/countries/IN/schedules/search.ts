import type {
  IndiaScheduleEntry,
  IndiaScheduleIndex,
  IndiaScheduleRatePeriod,
  ResolvedIndiaScheduleEntry,
} from './index.js';
import { INDIA_FULL_SCHEDULE_INDEX } from './full.js';
import { isEffectiveRatePeriod, sortedRateHistoryDesc } from './rate-history.js';

export interface IndiaScheduleSearchOptions {
  /**
   * Search term matching code OR description (case-insensitive substring & keyword match).
   * E.g. '8471', 'computer', 'live animals', 'consulting'.
   * If omitted or empty, matches all entries.
   */
  readonly query?: string;

  /**
   * Filter specifically by HSN or SAC code (e.g. prefix '84' or exact '8471').
   */
  readonly code?: string;

  /**
   * Filter specifically by description text (case-insensitive).
   */
  readonly description?: string;

  /**
   * Filter by entry kind: 'HSN' (Goods) or 'SAC' (Services).
   */
  readonly kind?: 'HSN' | 'SAC';

  /**
   * Filter by 2-digit HSN chapter (e.g. '01', '84').
   */
  readonly chapter?: string;

  /**
   * Optional calculation date in 'YYYY-MM-DD' format.
   * If provided, each item will include `resolvedRate` with active GST rate for that date.
   */
  readonly calculationDate?: string;

  /**
   * 1-based page number. Default: 1.
   */
  readonly page?: number;

  /**
   * Number of items per page. Default: 20.
   * Set to 0 or Infinity to return all matching items without pagination limits.
   */
  readonly limit?: number;

  /**
   * Custom schedule index or entry array to search within.
   * Defaults to INDIA_FULL_SCHEDULE_INDEX.
   */
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
}

export interface IndiaScheduleSearchResultItem {
  readonly code: string;
  readonly kind: 'HSN' | 'SAC';
  readonly description?: string;
  readonly rateHistory: readonly IndiaScheduleRatePeriod[];
  /**
   * Active GST rate period resolved for calculationDate (if calculationDate was supplied).
   */
  readonly resolvedRate?: ResolvedIndiaScheduleEntry;
}

export interface PaginatedScheduleResult<T = IndiaScheduleSearchResultItem> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

function resolveEntryForDate(
  entry: IndiaScheduleEntry,
  calculationDate: string,
): ResolvedIndiaScheduleEntry | undefined {
  for (const period of sortedRateHistoryDesc(entry.rateHistory)) {
    if (isEffectiveRatePeriod(period, calculationDate)) {
      return {
        code: entry.code,
        kind: entry.kind,
        ...(entry.description !== undefined ? { description: entry.description } : {}),
        ratePercent: period.ratePercent,
        taxability: period.taxability,
        effectiveFrom: period.effectiveFrom,
        effectiveTo: period.effectiveTo,
        ...(period.reverseCharge !== undefined ? { reverseCharge: period.reverseCharge } : {}),
        ...(period.cessRatePercent !== undefined ? { cessRatePercent: period.cessRatePercent } : {}),
      };
    }
  }
  return undefined;
}

interface ScoredEntry {
  readonly entry: IndiaScheduleEntry;
  readonly score: number;
}

/**
 * Searches and paginates India HSN/SAC schedule entries by code, description, kind, or chapter.
 *
 * @param options Filter, search query, date, and pagination options.
 * @returns Paginated result object with items, total, totalPages, and page navigation booleans.
 */
export function searchIndiaSchedule(
  options: IndiaScheduleSearchOptions = {},
): PaginatedScheduleResult {
  const scheduleSource = options.schedule ?? INDIA_FULL_SCHEDULE_INDEX;
  const entriesIterable = Array.isArray(scheduleSource)
    ? scheduleSource
    : (scheduleSource as IndiaScheduleIndex).values();

  const queryTrimmed = options.query?.trim().toLowerCase() ?? '';
  const queryTokens = queryTrimmed.length > 0 ? queryTrimmed.split(/\s+/).filter(Boolean) : [];

  const codeFilter = options.code?.trim().replace(/\s+/g, '') ?? '';
  const descFilter = options.description?.trim().toLowerCase() ?? '';
  const chapterFilter = options.chapter ? options.chapter.trim().padStart(2, '0') : '';
  const kindFilter = options.kind;
  const calcDate = options.calculationDate?.trim();

  const scoredMatches: ScoredEntry[] = [];

  for (const entry of entriesIterable) {
    // 1. Kind filter
    if (kindFilter !== undefined && entry.kind !== kindFilter) {
      continue;
    }

    // 2. Chapter filter (applies to HSN)
    if (chapterFilter.length > 0) {
      if (entry.kind !== 'HSN' || !entry.code.startsWith(chapterFilter)) {
        continue;
      }
    }

    // 3. Specific code filter
    if (codeFilter.length > 0 && !entry.code.startsWith(codeFilter)) {
      continue;
    }

    // 4. Specific description filter
    const descLower = (entry.description ?? '').toLowerCase();
    if (descFilter.length > 0 && !descLower.includes(descFilter)) {
      continue;
    }

    // 5. Query matching and relevance scoring
    if (queryTrimmed.length > 0) {
      const codeLower = entry.code.toLowerCase();
      let score = 0;

      if (codeLower === queryTrimmed) {
        score = 100; // Exact code match
      } else if (codeLower.startsWith(queryTrimmed)) {
        score = 80; // Code prefix match
      } else if (codeLower.includes(queryTrimmed)) {
        score = 60; // Code substring match
      } else if (descLower.startsWith(queryTrimmed)) {
        score = 50; // Description starts with query
      } else if (descLower.includes(queryTrimmed)) {
        score = 40; // Description contains exact phrase
      } else if (
        queryTokens.length > 1 &&
        queryTokens.every((token) => codeLower.includes(token) || descLower.includes(token))
      ) {
        score = 25; // All query words match across code or description
      }

      if (score === 0) {
        continue;
      }

      scoredMatches.push({ entry, score });
    } else {
      // No query term: keep entry with neutral score
      scoredMatches.push({ entry, score: 0 });
    }
  }

  // Sort if search query was provided (higher relevance first)
  if (queryTrimmed.length > 0) {
    scoredMatches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.entry.code.length !== b.entry.code.length) {
        return a.entry.code.length - b.entry.code.length;
      }
      return a.entry.code.localeCompare(b.entry.code);
    });
  }

  const total = scoredMatches.length;

  // Pagination parameters
  const rawPage = Number(options.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const rawLimit = Number(options.limit);
  let limit = 20;
  if (rawLimit === 0 || rawLimit === Infinity) {
    limit = total > 0 ? total : 1;
  } else if (Number.isFinite(rawLimit) && rawLimit > 0) {
    limit = Math.floor(rawLimit);
  }

  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const startIndex = (page - 1) * limit;
  const slicedEntries =
    startIndex < total ? scoredMatches.slice(startIndex, startIndex + limit) : [];

  const items: IndiaScheduleSearchResultItem[] = slicedEntries.map(({ entry }) => {
    const item: IndiaScheduleSearchResultItem = {
      code: entry.code,
      kind: entry.kind,
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      rateHistory: entry.rateHistory,
    };

    if (calcDate && calcDate.length > 0) {
      const resolved = resolveEntryForDate(entry, calcDate);
      if (resolved !== undefined) {
        return {
          ...item,
          resolvedRate: resolved,
        };
      }
    }

    return item;
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

/**
 * Alias for searchIndiaSchedule focused on pagination.
 */
export const paginateIndiaSchedule = searchIndiaSchedule;
