import { describe, expect, it } from 'vitest';
import {
  searchIndiaSchedule,
  paginateIndiaSchedule,
  INDIA_FULL_SCHEDULE_INDEX,
} from '../src/in/schedule.js';
import { buildScheduleIndex } from '../src/countries/IN/schedules/index.js';
import { IndiaTaxability } from '../src/countries/IN/types.js';
import {
  getLoadedShardIds,
  resetIndiaFullScheduleCaches,
} from '../src/countries/IN/schedules/full.js';

describe('searchIndiaSchedule and paginateIndiaSchedule', () => {
  it('paginates full schedule without query parameters', () => {
    const page1 = searchIndiaSchedule({ page: 1, limit: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(13445);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(10);
    expect(page1.totalPages).toBe(Math.ceil(13445 / 10));
    expect(page1.hasNextPage).toBe(true);
    expect(page1.hasPreviousPage).toBe(false);

    const page2 = searchIndiaSchedule({ page: 2, limit: 10 });
    expect(page2.items).toHaveLength(10);
    expect(page2.page).toBe(2);
    expect(page2.hasPreviousPage).toBe(true);
    expect(page2.hasNextPage).toBe(true);
    expect(page2.items[0].code).not.toBe(page1.items[0].code);
  });

  it('handles out of bounds page numbers gracefully', () => {
    const res = searchIndiaSchedule({ page: 99999, limit: 10 });
    expect(res.items).toEqual([]);
    expect(res.page).toBe(99999);
    expect(res.hasNextPage).toBe(false);
    expect(res.hasPreviousPage).toBe(true);

    const invalidPage = searchIndiaSchedule({ page: -1, limit: 5 });
    expect(invalidPage.page).toBe(1);
    expect(invalidPage.items).toHaveLength(5);
  });

  it('searches HSN entries by description keywords case-insensitively', () => {
    const res = searchIndiaSchedule({ query: 'computer', limit: 10 });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.total).toBeGreaterThan(0);
    const matchesDescOrCode = res.items.some(
      (item) =>
        item.description?.toLowerCase().includes('computer') ||
        item.code.toLowerCase().includes('computer'),
    );
    expect(matchesDescOrCode).toBe(true);
  });

  it('matches multi-token queries across description and code', () => {
    const res = searchIndiaSchedule({ query: 'pure breeding animals' });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].code.startsWith('01')).toBe(true);
  });

  it('prioritizes exact code match when searching by code', () => {
    const res = searchIndiaSchedule({ query: '8471' });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items[0].code).toBe('8471');
  });

  it('filters specifically by code prefix', () => {
    const res = searchIndiaSchedule({ code: '8471', limit: 50 });
    expect(res.items.length).toBeGreaterThan(0);
    for (const item of res.items) {
      expect(item.code.startsWith('8471')).toBe(true);
    }
  });

  it('loads only the relevant lazy shard for a chapter-specific code prefix', () => {
    resetIndiaFullScheduleCaches();
    const res = searchIndiaSchedule({ code: '8471', kind: 'HSN', limit: 50 });
    expect(res.total).toBeGreaterThan(0);
    expect(getLoadedShardIds()).toEqual(['hsn-84']);
  });

  it('keeps deterministic ranked pagination without retaining every match', () => {
    const first = searchIndiaSchedule({ query: 'animal', page: 1, limit: 3 });
    const second = searchIndiaSchedule({ query: 'animal', page: 2, limit: 3 });
    const all = searchIndiaSchedule({ query: 'animal', limit: 0 });
    expect([...first.items, ...second.items]).toEqual(all.items.slice(0, 6));
    expect(first.total).toBe(all.total);
    expect(second.total).toBe(all.total);
  });

  it('filters by kind HSN vs SAC', () => {
    const sacRes = searchIndiaSchedule({ kind: 'SAC', limit: 20 });
    expect(sacRes.total).toBe(568);
    for (const item of sacRes.items) {
      expect(item.kind).toBe('SAC');
    }

    const hsnRes = searchIndiaSchedule({ kind: 'HSN', limit: 20 });
    expect(hsnRes.total).toBe(12877);
    for (const item of hsnRes.items) {
      expect(item.kind).toBe('HSN');
    }
  });

  it('filters by HSN chapter', () => {
    const ch01 = searchIndiaSchedule({ chapter: '01', limit: 100 });
    expect(ch01.total).toBeGreaterThan(0);
    for (const item of ch01.items) {
      expect(item.kind).toBe('HSN');
      expect(item.code.startsWith('01')).toBe(true);
    }
  });

  it('resolves active GST rate when calculationDate is provided', () => {
    const res = searchIndiaSchedule({
      code: '8471',
      kind: 'HSN',
      calculationDate: '2026-04-01',
      limit: 1,
    });
    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item.resolvedRate).toBeDefined();
    expect(item.resolvedRate?.ratePercent).toBe(18);
    expect(item.resolvedRate?.taxability).toBe(IndiaTaxability.TAXABLE);
    expect(item.resolvedRate?.effectiveFrom).toBe('2017-07-01');
  });

  it('resolves unsorted custom rate histories and returns no rate for a gap', () => {
    const schedule = [{
      code: '1111', kind: 'HSN' as const, description: 'Gap test',
      rateHistory: [
        { ratePercent: 18, taxability: IndiaTaxability.TAXABLE, effectiveFrom: '2022-01-01', effectiveTo: null },
        { ratePercent: 5, taxability: IndiaTaxability.TAXABLE, effectiveFrom: '2020-01-01', effectiveTo: '2020-12-31' },
      ],
    }];
    expect(searchIndiaSchedule({ schedule, code: '1111', calculationDate: '2020-06-01' }).items[0]?.resolvedRate?.ratePercent).toBe(5);
    expect(searchIndiaSchedule({ schedule, code: '1111', calculationDate: '2021-06-01' }).items[0]?.resolvedRate).toBeUndefined();
  });

  it('returns all items when limit is 0 or Infinity', () => {
    const res = searchIndiaSchedule({ chapter: '01', limit: 0 });
    expect(res.items).toHaveLength(res.total);
    expect(res.limit).toBe(res.total);
    expect(res.totalPages).toBe(1);
    expect(res.hasNextPage).toBe(false);
  });

  it('handles empty results when query does not match anything', () => {
    const res = searchIndiaSchedule({ query: 'non_existent_search_query_xyz123' });
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.totalPages).toBe(0);
    expect(res.hasNextPage).toBe(false);
    expect(res.hasPreviousPage).toBe(false);
  });

  it('works with a custom schedule array or index', () => {
    const customEntries = [
      {
        code: '1234',
        kind: 'HSN' as const,
        description: 'Special Widget Item',
        rateHistory: [
          {
            ratePercent: 12,
            taxability: IndiaTaxability.TAXABLE,
            effectiveFrom: '2020-01-01',
            effectiveTo: null,
          },
        ],
      },
    ];

    const res = searchIndiaSchedule({
      schedule: customEntries,
      query: 'widget',
    });
    expect(res.total).toBe(1);
    expect(res.items[0].code).toBe('1234');
    expect(res.items[0].description).toBe('Special Widget Item');
  });

  it('paginateIndiaSchedule behaves identically as an alias', () => {
    const a = searchIndiaSchedule({ query: '8471', limit: 5 });
    const b = paginateIndiaSchedule({ query: '8471', limit: 5 });
    expect(a).toEqual(b);
  });
});
