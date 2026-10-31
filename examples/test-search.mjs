import { searchIndiaSchedule } from '../dist/index.js';

// Query argument from command line or default 'tea'
const query = process.argv[2] || 'tea';
const page = Number(process.argv[3]) || 1;
const limit = Number(process.argv[4]) || 3;

console.log(`\n🔍 Searching schedule for query: "${query}" (page ${page}, limit ${limit})...\n`);

const result = searchIndiaSchedule({
  query,
  kind: 'HSN',
  calculationDate: '2026-04-01',
  page,
  limit,
});

console.log('📊 Pagination Summary:');
console.log({
  totalMatches: result.total,
  currentPage: result.page,
  limitPerPage: result.limit,
  totalPages: result.totalPages,
  hasNextPage: result.hasNextPage,
  hasPreviousPage: result.hasPreviousPage,
});

console.log('\n📦 Matched Items:');
result.items.forEach((item, index) => {
  console.log(`\n[#${index + 1}] Code: ${item.code} (${item.kind})`);
  console.log(`    Description: ${item.description}`);
  if (item.resolvedRate) {
    console.log(`    GST Rate: ${item.resolvedRate.ratePercent}% (${item.resolvedRate.taxability})`);
    console.log(`    Effective From: ${item.resolvedRate.effectiveFrom}`);
  }
});

console.log('\n📄 Full JSON Response:');
console.log(JSON.stringify(result, null, 2));
