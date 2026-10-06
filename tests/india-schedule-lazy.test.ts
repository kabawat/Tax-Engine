import { describe, expect, it, beforeEach } from 'vitest';
import Tax, { PricingMode, TaxEngineErrorCode } from '../src/index.js';
import {
  pickIndiaSchedule,
  resolveScheduleEntry,
  scheduleLookupKey,
} from '../src/countries/IN/schedules/index.js';
import {
  INDIA_FULL_SCHEDULE,
  INDIA_FULL_SCHEDULE_INDEX,
  INDIA_FULL_SCHEDULE_META,
  INDIA_SCHEDULE_INTEGRITY,
  getLoadedShardIds,
  resetIndiaFullScheduleCaches,
  shardIdForLookupKey,
} from '../src/countries/IN/schedules/full.js';

const DATE = '2026-04-01';
const KA_GSTIN = '29AABCU9603R1Z2';

describe('lazy India schedule index', () => {
  beforeEach(() => {
    resetIndiaFullScheduleCaches();
  });

  it('does not load shards until a code is requested', () => {
    expect(getLoadedShardIds()).toEqual([]);
    expect(INDIA_FULL_SCHEDULE_INDEX.size).toBe(
      INDIA_SCHEDULE_INTEGRITY.generatedRecordCount,
    );
  });

  it('loads only the required HSN shard for a lookup', () => {
    const entry = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '8471'));
    expect(entry?.code).toBe('8471');
    expect(entry?.rateHistory[0]?.ratePercent).toBe(18);
    expect(getLoadedShardIds()).toEqual(['hsn-84']);
  });

  it('loads the SAC shard independently', () => {
    const entry = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('SAC', '998314'));
    expect(entry?.kind).toBe('SAC');
    expect(getLoadedShardIds()).toEqual(['sac-9983']);
  });

  it('caches shards across repeated lookups', () => {
    const a = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '8471'));
    const b = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '847130'));
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(getLoadedShardIds()).toEqual(['hsn-84']);
    expect(
      INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '8471')),
    ).toBe(a);
  });

  it('dedupes concurrent shard loads (single-threaded re-entry safe)', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, async () =>
        INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '1001')),
      ),
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]?.code).toBe('1001');
    expect(getLoadedShardIds()).toEqual(['hsn-10']);
  });

  it('returns undefined for unknown codes without throwing', () => {
    expect(
      INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '99999999')),
    ).toBeUndefined();
    expect(
      INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('SAC', '000000')),
    ).toBeUndefined();
  });

  it('maps lookup keys to shard ids', () => {
    expect(shardIdForLookupKey('HSN:8471')).toBe('hsn-84');
    expect(shardIdForLookupKey('SAC:998314')).toBe('sac-9983');
    expect(shardIdForLookupKey('nope')).toBeUndefined();
  });

  it('preserves resolveScheduleEntry + Tax calculate behavior', () => {
    const resolved = resolveScheduleEntry(
      '847130',
      'HSN',
      DATE,
      INDIA_FULL_SCHEDULE_INDEX,
    );
    expect(resolved?.ratePercent).toBe(18);

    const tax = new Tax('IN', { stateCodeSource: 'STATE' });
    const result = tax.calculate({
      seller: { state: 'KA', gstin: KA_GSTIN },
      buyer: { state: 'MH', gstin: '27AABCU9603R1Z2' },
      items: [{
        type: 'PRODUCT',
        hsn: '8471',
        amount: { amount: 10000, currency: 'INR' },
        quantity: 1,
        pricingMode: PricingMode.EXCLUSIVE,
      }],
      calculationDate: DATE,
    });
    expect(result.totalTax.amount).toBe(1800);
  });

  it('pickIndiaSchedule still fail-fasts on unknown codes', () => {
    expect(() =>
      pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, { hsn: ['00000000'] }),
    ).toThrow(expect.objectContaining({ code: TaxEngineErrorCode.NO_RULE_FOUND }));
  });

  it('INDIA_FULL_SCHEDULE materialises with full record count', () => {
    expect(INDIA_FULL_SCHEDULE.length).toBe(
      INDIA_SCHEDULE_INTEGRITY.generatedRecordCount,
    );
    expect(INDIA_FULL_SCHEDULE[0]?.code).toBeTruthy();
  });
});

describe('schedule data integrity', () => {
  it('source record count equals generated count after identical-dupe removal', () => {
    const {
      sourceRecordCount,
      generatedRecordCount,
      duplicateIdenticalRemoved,
      hsnCount,
      sacCount,
    } = INDIA_SCHEDULE_INTEGRITY;

    expect(generatedRecordCount + duplicateIdenticalRemoved).toBe(sourceRecordCount);
    expect(hsnCount + sacCount).toBe(generatedRecordCount);
    expect(hsnCount).toBe(INDIA_FULL_SCHEDULE_META.hsnCount);
    expect(sacCount).toBe(INDIA_FULL_SCHEDULE_META.sacCount);
    expect(INDIA_FULL_SCHEDULE_INDEX.size).toBe(generatedRecordCount);
  });

  it('every integrity shard id is loadable and contributes entries', () => {
    resetIndiaFullScheduleCaches();
    let total = 0;
    for (const shardId of INDIA_SCHEDULE_INTEGRITY.shardIds) {
      if (shardId.startsWith('sac-')) {
        const heading = shardId.replace('sac-', '');
        void INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('SAC', `${heading}11`));
      } else {
        const chapter = shardId.replace('hsn-', '');
        const key = scheduleLookupKey('HSN', `${chapter}01`);
        void INDIA_FULL_SCHEDULE_INDEX.get(key);
      }
    }
    total = INDIA_FULL_SCHEDULE.length;
    expect(total).toBe(INDIA_SCHEDULE_INTEGRITY.generatedRecordCount);
    expect(getLoadedShardIds().length).toBe(INDIA_SCHEDULE_INTEGRITY.shardCount);
  });
});
