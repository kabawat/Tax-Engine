#!/usr/bin/env node
// Lookup / startup / memory bench against dist/
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function rssMb() {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
}

const rssBefore = rssMb();
const tImport = performance.now();
const {
  INDIA_FULL_SCHEDULE_INDEX,
  resetIndiaFullScheduleCaches,
  getLoadedShardIds,
} = await import(path.join(ROOT, 'dist/countries/IN/schedules/full.js'));
const { pickIndiaSchedule, scheduleLookupKey } = await import(
  path.join(ROOT, 'dist/countries/IN/schedules/index.js')
);
const { searchIndiaSchedule } = await import(path.join(ROOT, 'dist/in/schedule.js'));
const importMs = performance.now() - tImport;
const rssAfterImport = rssMb();

resetIndiaFullScheduleCaches();

const lookups = [
  ['HSN', '8471'],
  ['HSN', '1001'],
  ['HSN', '7208'],
  ['HSN', '8703'],
  ['SAC', '998314'],
];

const tFirst = performance.now();
for (const [kind, code] of lookups) {
  const hit = INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey(kind, code));
  if (!hit) {
    throw new Error(`missing ${kind}:${code}`);
  }
}
const firstMs = performance.now() - tFirst;
const shardsAfterFirst = getLoadedShardIds().length;
const rssAfterFirst = rssMb();

const tWarm = performance.now();
for (let i = 0; i < 10_000; i += 1) {
  INDIA_FULL_SCHEDULE_INDEX.get(scheduleLookupKey('HSN', '8471'));
}
const warmMs = performance.now() - tWarm;

function measure(name, callback, iterations = 100) {
  const started = performance.now();
  let result;
  for (let i = 0; i < iterations; i += 1) result = callback();
  return {
    name,
    iterations,
    totalMs: Math.round((performance.now() - started) * 100) / 100,
    resultCount: result?.total ?? result?.items?.length,
  };
}

resetIndiaFullScheduleCaches();
const coldPrefix = measure(
  'coldCodePrefix',
  () => searchIndiaSchedule({ code: '8471', kind: 'HSN', limit: 20 }),
  1,
);
const searchBenchmarks = [
  coldPrefix,
  measure('warmExactCodeQuery', () => searchIndiaSchedule({ query: '8471', limit: 20 })),
  measure('codePrefix', () => searchIndiaSchedule({ code: '8471', kind: 'HSN', limit: 20 })),
  measure('description', () => searchIndiaSchedule({ query: 'computer', limit: 20 })),
  measure('multiKeyword', () => searchIndiaSchedule({ query: 'pure breeding animals', limit: 20 })),
  measure('chapter', () => searchIndiaSchedule({ chapter: '84', limit: 20 })),
  measure('rankedPage10', () => searchIndiaSchedule({ query: 'animal', page: 10, limit: 20 })),
  measure('rateResolution', () => searchIndiaSchedule({ code: '8471', kind: 'HSN', calculationDate: '2026-04-01', limit: 20 })),
];
const rssAfterSearches = rssMb();

const subset = pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
  hsn: ['8471', '1001'],
  sac: ['998314'],
});
if (subset.size !== 3) {
  throw new Error(`expected subset size 3, got ${subset.size}`);
}

console.log(
  JSON.stringify(
    {
      importMs: Math.round(importMs * 100) / 100,
      firstLookupsMs: Math.round(firstMs * 100) / 100,
      warm10kLookupsMs: Math.round(warmMs * 100) / 100,
      searchBenchmarks,
      shardsLoadedAfterFirstLookups: shardsAfterFirst,
      rssMbBeforeImport: rssBefore,
      rssMbAfterImport: rssAfterImport,
      rssMbAfterFirstLookups: rssAfterFirst,
      rssMbAfterSearches: rssAfterSearches,
      indexSize: INDIA_FULL_SCHEDULE_INDEX.size,
      requireCacheHasShard: Boolean(
        require.cache[
          path.join(
            ROOT,
            'dist/countries/IN/schedules/generated/shards/hsn-84.cjs',
          )
        ],
      ),
    },
    null,
    2,
  ),
);
