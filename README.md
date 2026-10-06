# tax-engine

Zero-configuration multi-country tax calculation SDK for Node.js and TypeScript.

```ts
import Tax from 'tax-engine';

const tax = new Tax('IN', { stateCodeSource: 'GSTIN' });
const result = tax.calculate(input);
```

Country is fixed at construction. Node.js 18+ (ESM). Zero runtime dependencies.

---

## Quick start

```ts
import Tax from 'tax-engine';

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
```

Also:

```ts
new Tax('AE')
new Tax('US')
```

Unknown country → `INVALID_COUNTRY` at construction.

---

## India — `new Tax('IN', config)`

### Config

```ts
type StateCodeSource = 'GSTIN' | 'STATE';

new Tax('IN', { stateCodeSource: 'GSTIN' }) // derive state from GSTIN
new Tax('IN', { stateCodeSource: 'STATE' }) // use seller.state / buyer.state (default)
```

- Country comes only from the constructor (not from seller/buyer).
- Registration = GSTIN present (no `gstRegistered` flag).
- Conflicting GSTIN vs `state` → `INVALID_INPUT` (never silent merge).

### GSTIN mode — payload

```ts
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
```

### GSTIN mode — return value

```ts
{
  country: 'IN',
  taxability: 'TAXABLE',
  chargeMode: 'FORWARD_CHARGE',
  liabilityParty: 'SELLER',
  currency: 'INR',
  pricingMode: 'EXCLUSIVE',
  originalAmount: { amount: 10000, currency: 'INR' },
  taxableAmount: { amount: 10000, currency: 'INR' },
  taxes: [
    {
      type: 'IGST',
      rate: 18,
      taxableBase: { amount: 10000, currency: 'INR' },
      amount: { amount: 1800, currency: 'INR' },
      name: 'IGST',
    },
  ],
  totalTax: { amount: 1800, currency: 'INR' },
  finalAmount: { amount: 11800, currency: 'INR' },
  details: {
    placeOfSupply: { state: 'MH', kind: 'GOODS', ruleId: 'goods.recipient-location' },
    scheduleCode: '8471',
    scheduleKind: 'HSN',
    supplierState: 'KA',
    buyerState: 'MH',
    stateCodeSource: 'GSTIN',
    supplierStateSource: 'GSTIN',
    buyerStateSource: 'GSTIN',
    reverseCharge: false,
  },
}
```

### STATE mode — payload

```ts
const tax = new Tax('IN', { stateCodeSource: 'STATE' });

const result = tax.calculate({
  seller: { state: 'KA', gstin: '29AABCU9603R1Z2' },
  buyer: { state: 'KA' },
  item: {
    type: 'PRODUCT',
    hsn: '8471',
    amount: { amount: 10000, currency: 'INR' },
    quantity: 1,
    pricingMode: 'EXCLUSIVE',
  },
  calculationDate: '2026-04-01',
});

// taxes: CGST 9% + SGST 9% = 1800
```

Unregistered party (no GSTIN):

```ts
seller: { state: 'KA' } // no GSTIN → not registered → no forward GST
```

### India HSN / SAC schedule

`new Tax('IN')` defaults to the full India schedule (single source of truth).
Lookups are chapter-sharded and lazy: only the HSN/SAC shards needed for a code are loaded into memory.

Apps that only need a subset pass codes via `pickIndiaSchedule` — rates, taxability, RCM, and effective dates always come from the full schedule:

```ts
import Tax from 'tax-engine';
import {
  INDIA_FULL_SCHEDULE_INDEX,
  pickIndiaSchedule,
} from 'tax-engine/in/schedule';

const tax = new Tax('IN', {
  stateCodeSource: 'GSTIN',
  schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
    hsn: ['8471', '1001'],
    sac: ['998314'],
  }),
});
```

Unknown codes in `pickIndiaSchedule` → `NO_RULE_FOUND` at selection time.
Unknown HSN/SAC at calculate time → `NO_RULE_FOUND`.

Rates may lag official CBIC notifications — verify before production use.

---

## UAE — `new Tax('AE')`

### Payload

```ts
const tax = new Tax('AE');

const result = tax.calculate({
  amount: { amount: 200, currency: 'AED' },
  quantity: 1,
  item: { type: 'SERVICE', category: 'CONSULTING' },
  pricingMode: 'EXCLUSIVE',
  calculationDate: '2025-06-01',
});
```

### Return value

```ts
{
  country: 'AE',
  taxability: 'TAXABLE',
  chargeMode: 'FORWARD_CHARGE',
  liabilityParty: 'SELLER',
  currency: 'AED',
  pricingMode: 'EXCLUSIVE',
  originalAmount: { amount: 200, currency: 'AED' },
  taxableAmount: { amount: 200, currency: 'AED' },
  taxes: [
    {
      type: 'VAT',
      rate: 5,
      taxableBase: { amount: 200, currency: 'AED' },
      amount: { amount: 10, currency: 'AED' },
      name: 'UAE VAT Standard',
    },
  ],
  totalTax: { amount: 10, currency: 'AED' },
  finalAmount: { amount: 210, currency: 'AED' },
  details: { limitedSupport: true },
}
```

Sample categories: `GENERAL` / `CONSULTING` / `STANDARD` → 5% VAT; `ZERO` → 0%. Unknown → `NO_RULE_FOUND`.

---

## US — `new Tax('US')`

### Payload

```ts
const tax = new Tax('US');

const result = tax.calculate({
  amount: { amount: 100, currency: 'USD' },
  quantity: 1,
  item: { type: 'PRODUCT', category: 'GENERAL' },
  pricingMode: 'EXCLUSIVE',
  jurisdiction: { state: 'CA' },
  calculationDate: '2026-04-01',
});
```

### Return value

```ts
{
  country: 'US',
  taxability: 'TAXABLE',
  chargeMode: 'FORWARD_CHARGE',
  liabilityParty: 'SELLER',
  currency: 'USD',
  pricingMode: 'EXCLUSIVE',
  originalAmount: { amount: 100, currency: 'USD' },
  taxableAmount: { amount: 100, currency: 'USD' },
  taxes: [
    {
      type: 'SALES_TAX',
      rate: 7.25,
      taxableBase: { amount: 100, currency: 'USD' },
      amount: { amount: 7.25, currency: 'USD' },
      name: 'California Sales Tax Product',
    },
  ],
  totalTax: { amount: 7.25, currency: 'USD' },
  finalAmount: { amount: 107.25, currency: 'USD' },
  details: { limitedSupport: true },
}
```

---

## Shared result shape

```ts
{
  country: string
  taxability: string
  chargeMode: 'FORWARD_CHARGE' | 'REVERSE_CHARGE'
  liabilityParty: 'SELLER' | 'BUYER' | 'NONE'
  currency: string
  pricingMode: 'EXCLUSIVE' | 'INCLUSIVE'
  originalAmount / taxableAmount / totalTax / finalAmount: Money
  taxes: Array<{ type, rate, taxableBase, amount, name? }>
  details?: Record<string, unknown>
}
```

---

## Errors

| Code | When |
|------|------|
| `INVALID_COUNTRY` | `new Tax('XYZ')` |
| `INVALID_INPUT` | Bad GSTIN, state mismatch, missing state/GSTIN |
| `NO_RULE_FOUND` | Unknown HSN/SAC or unmatched UAE/US category |
| `UNSUPPORTED_CASE` | Composition, SEZ, credit notes, etc. |

---

## Limitations

- Composition, exports, imports, SEZ, credit/debit notes: not supported
- UAE/US providers are sample-limited

## License

MIT
# Tax-Engine
