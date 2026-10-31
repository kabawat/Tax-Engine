import type { IndiaScheduleEntry, IndiaScheduleIndex, IndiaScheduleRatePeriod, ResolvedIndiaScheduleEntry } from './index.js';
import { INDIA_FULL_SCHEDULE_INDEX, entriesForIndiaScheduleShards } from './full.js';
import { findEffectiveRatePeriod, sortedRateHistoryDesc } from './rate-history.js';

export interface IndiaScheduleSearchOptions {
  readonly query?: string; readonly code?: string; readonly description?: string;
  readonly kind?: 'HSN' | 'SAC'; readonly chapter?: string; readonly calculationDate?: string;
  readonly page?: number; readonly limit?: number;
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
}
export interface IndiaScheduleSearchResultItem {
  readonly code: string; readonly kind: 'HSN' | 'SAC'; readonly description?: string;
  readonly rateHistory: readonly IndiaScheduleRatePeriod[]; readonly resolvedRate?: ResolvedIndiaScheduleEntry;
}
export interface PaginatedScheduleResult<T = IndiaScheduleSearchResultItem> {
  readonly items: readonly T[]; readonly total: number; readonly page: number; readonly limit: number;
  readonly totalPages: number; readonly hasNextPage: boolean; readonly hasPreviousPage: boolean;
}
interface ScoredEntry { readonly entry: IndiaScheduleEntry; readonly score: number; }

const normalizedDescriptions = new WeakMap<IndiaScheduleEntry, string>();
const normalizedRateHistories = new WeakMap<readonly IndiaScheduleRatePeriod[], readonly IndiaScheduleRatePeriod[]>();
function descriptionOf(entry: IndiaScheduleEntry): string {
  const cached = normalizedDescriptions.get(entry);
  if (cached !== undefined) return cached;
  const normalized = (entry.description ?? '').toLowerCase();
  normalizedDescriptions.set(entry, normalized);
  return normalized;
}
function resolveForDate(entry: IndiaScheduleEntry, date: string): ResolvedIndiaScheduleEntry | undefined {
  let history = normalizedRateHistories.get(entry.rateHistory);
  if (history === undefined) {
    history = entry.rateHistory.every((period, index, values) => index === 0 || values[index - 1]!.effectiveFrom >= period.effectiveFrom)
      ? entry.rateHistory
      : sortedRateHistoryDesc(entry.rateHistory);
    normalizedRateHistories.set(entry.rateHistory, history);
  }
  const period = findEffectiveRatePeriod(history, date);
  return period === undefined ? undefined : {
    code: entry.code, kind: entry.kind, ...(entry.description !== undefined ? { description: entry.description } : {}),
    ratePercent: period.ratePercent, taxability: period.taxability, effectiveFrom: period.effectiveFrom, effectiveTo: period.effectiveTo,
    ...(period.reverseCharge !== undefined ? { reverseCharge: period.reverseCharge } : {}),
    ...(period.cessRatePercent !== undefined ? { cessRatePercent: period.cessRatePercent } : {}),
  };
}
function score(entry: IndiaScheduleEntry, query: string, tokens: readonly string[]): number {
  if (entry.code === query) return 100;
  if (entry.code.startsWith(query)) return 80;
  if (entry.code.includes(query)) return 60;
  const description = descriptionOf(entry);
  if (description.startsWith(query)) return 50;
  if (description.includes(query)) return 40;
  return tokens.length > 1 && tokens.every((token) => entry.code.includes(token) || description.includes(token)) ? 25 : 0;
}
function compareRank(a: ScoredEntry, b: ScoredEntry): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.entry.code.length !== b.entry.code.length) return a.entry.code.length - b.entry.code.length;
  return a.entry.code < b.entry.code ? -1 : a.entry.code > b.entry.code ? 1 : 0;
}

class BoundedResults {
  private readonly heap: ScoredEntry[] = [];
  constructor(private readonly capacity: number) {}
  add(value: ScoredEntry): void {
    if (this.capacity === 0) return;
    if (this.heap.length < this.capacity) { this.heap.push(value); this.up(this.heap.length - 1); return; }
    if (compareRank(value, this.heap[0]!) < 0) { this.heap[0] = value; this.down(0); }
  }
  sorted(): ScoredEntry[] { return this.heap.sort(compareRank); }
  private worse(a: ScoredEntry, b: ScoredEntry): boolean { return compareRank(a, b) > 0; }
  private up(index: number): void {
    while (index > 0) { const parent = Math.floor((index - 1) / 2); if (!this.worse(this.heap[index]!, this.heap[parent]!)) return; [this.heap[index], this.heap[parent]] = [this.heap[parent]!, this.heap[index]!]; index = parent; }
  }
  private down(index: number): void {
    for (;;) { const left = index * 2 + 1; const right = left + 1; let worst = index;
      if (left < this.heap.length && this.worse(this.heap[left]!, this.heap[worst]!)) worst = left;
      if (right < this.heap.length && this.worse(this.heap[right]!, this.heap[worst]!)) worst = right;
      if (worst === index) return; [this.heap[index], this.heap[worst]] = [this.heap[worst]!, this.heap[index]!]; index = worst;
    }
  }
}

function narrowedDefaultEntries(code: string, chapter: string, kind: IndiaScheduleSearchOptions['kind']): Iterable<IndiaScheduleEntry> | undefined {
  const hsnPrefix = chapter || (code.length >= 2 ? code.slice(0, 2) : '');
  const shardIds: string[] = [];
  if (hsnPrefix && (kind === undefined || kind === 'HSN') && /^\d{2}$/.test(hsnPrefix)) shardIds.push(`hsn-${hsnPrefix}`);
  if (code.length >= 4 && (kind === undefined || kind === 'SAC') && /^\d{4}$/.test(code.slice(0, 4))) shardIds.push(`sac-${code.slice(0, 4)}`);
  return shardIds.length ? entriesForIndiaScheduleShards(shardIds) : undefined;
}
function toItem(entry: IndiaScheduleEntry, date: string | undefined): IndiaScheduleSearchResultItem {
  const item: IndiaScheduleSearchResultItem = { code: entry.code, kind: entry.kind, ...(entry.description !== undefined ? { description: entry.description } : {}), rateHistory: entry.rateHistory };
  const resolvedRate = date === undefined ? undefined : resolveForDate(entry, date);
  return resolvedRate === undefined ? item : { ...item, resolvedRate };
}

export function searchIndiaSchedule(options: IndiaScheduleSearchOptions = {}): PaginatedScheduleResult {
  const source = options.schedule ?? INDIA_FULL_SCHEDULE_INDEX;
  const query = options.query?.trim().toLowerCase() ?? '';
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const code = options.code?.trim().replace(/\s+/g, '') ?? '';
  const description = options.description?.trim().toLowerCase() ?? '';
  const chapter = options.chapter?.trim().padStart(2, '0') ?? '';
  const rawPage = Number(options.page); const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const rawLimit = Number(options.limit); const unbounded = rawLimit === 0 || rawLimit === Infinity;
  const limit = !unbounded && Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 20;
  const start = Math.min(Number.MAX_SAFE_INTEGER, (page - 1) * limit);
  const narrowed = source === INDIA_FULL_SCHEDULE_INDEX ? narrowedDefaultEntries(code, chapter, options.kind) : undefined;
  const entries: Iterable<IndiaScheduleEntry> = narrowed ?? (Array.isArray(source) ? source : source.values());
  const match = (entry: IndiaScheduleEntry): number | undefined => {
    if (options.kind !== undefined && entry.kind !== options.kind) return undefined;
    if (chapter && (entry.kind !== 'HSN' || !entry.code.startsWith(chapter))) return undefined;
    if (code && !entry.code.startsWith(code)) return undefined;
    if (description && !descriptionOf(entry).includes(description)) return undefined;
    if (!query) return 0;
    const value = score(entry, query, tokens); return value === 0 ? undefined : value;
  };
  let total = 0; let output: IndiaScheduleEntry[];
  if (!query) {
    output = [];
    for (const entry of entries) { if (match(entry) === undefined) continue; if (unbounded || (total >= start && output.length < limit)) output.push(entry); total += 1; }
  } else {
    const capacity = unbounded ? Number.MAX_SAFE_INTEGER : Math.min(Number.MAX_SAFE_INTEGER, start + limit);
    const retained = new BoundedResults(capacity);
    for (const entry of entries) { const value = match(entry); if (value === undefined) continue; total += 1; retained.add({ entry, score: value }); }
    const ranked = retained.sorted(); output = unbounded ? ranked.map(({ entry }) => entry) : ranked.slice(start).map(({ entry }) => entry);
  }
  const resolvedLimit = unbounded ? Math.max(total, 1) : limit;
  const totalPages = total === 0 ? 0 : Math.ceil(total / resolvedLimit);
  return { items: output.map((entry) => toItem(entry, options.calculationDate?.trim() || undefined)), total, page, limit: resolvedLimit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 && totalPages > 0 };
}
export const paginateIndiaSchedule = searchIndiaSchedule;
