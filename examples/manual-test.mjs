import Tax from '../dist/index.js';

const tax = new Tax('IN', { stateCodeSource: 'GSTIN' });

const result = tax.calculate({
  seller: { gstin: '29AABCU9603R1Z2' },
  buyer: { gstin: '27AABCU9603R1Z2' },
  item: {
    type: 'PRODUCT',
    hsn: '8471',
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: 'EXCLUSIVE',
  },
  calculationDate: '2026-04-01',
});

console.log('country:', result.country);
console.log('heads:', result.taxes.map((t) => `${t.type} ${t.rate}% = ${t.amount.amount}`));
console.log('totalTax:', result.totalTax.amount);
console.log('finalAmount:', result.finalAmount.amount);
console.log('details:', result.details);

console.log('providers:', new Tax('AE').country, new Tax('US').country);
