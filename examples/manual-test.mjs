import Tax, { searchIndiaSchedule, paginateIndiaSchedule } from '../dist/index.js';

// 1. Tax calculation test
const tax = new Tax('IN', { stateCodeSource: 'GSTIN' });

const result = tax.calculate({
  seller: { gstin: '29AABCU9603R1ZJ' },
  buyer: { gstin: '27AABCU9603R1ZN' },
  items: [{
    type: 'PRODUCT',
    hsn: '8471',
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: 'EXCLUSIVE',
  }],
  calculationDate: '2026-04-01',
});

console.log('=== Tax Calculation Result ===');
console.log('country:', result.country);
console.log('heads:', result.taxes.map((t) => `${t.type} ${t.rate}% = ${t.amount.amount}`));
console.log('totalTax:', result.totalTax.amount);
console.log('finalAmount:', result.finalAmount.amount);

// 2. Search HSN by keyword test
console.log('\n=== Search HSN by Description ===');
const searchResult = searchIndiaSchedule({
  query: 'computer',
  kind: 'HSN',
  calculationDate: '2026-04-01',
  page: 1,
  limit: 2,
});
console.log('Total matches found:', searchResult.total);
console.log('Page:', searchResult.page, 'of', searchResult.totalPages);
console.log('First 2 matches:', searchResult.items.map((item) => ({
  code: item.code,
  desc: item.description?.slice(0, 50) + '...',
  rate: item.resolvedRate?.ratePercent + '%',
})));

// 3. Paginate all schedule data test
console.log('\n=== Pagination Test ===');
const pageData = paginateIndiaSchedule({ page: 1, limit: 3 });
console.log('Total entries:', pageData.total);
console.log('Sample page items count:', pageData.items.length);
console.log('Has next page:', pageData.hasNextPage);
