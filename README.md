# tax-engine

Multi-country tax calculation SDK for Node.js and TypeScript — India GST, UAE VAT, US sales tax.

- Node.js 18+
- ESM
- Zero runtime dependencies

---

## Install

```bash
npm install tax-engine
```

```bash
yarn add tax-engine
```

```bash
pnpm add tax-engine
```

---

## Quick start

```ts
import Tax from 'tax-engine';

const tax = new Tax('IN', { stateCodeSource: 'GSTIN' });

const result = tax.calculate({
  seller: { gstin: '29AABCU9603R1Z2' },
  buyer: { gstin: '27AABCU9603R1Z2' },
  items: [
    {
      type: 'PRODUCT',
      hsn: '8471',
      amount: { amount: 10000, currency: 'INR' },
      quantity: 1,
      pricingMode: 'EXCLUSIVE',
    },
    {
      type: 'SERVICE',
      sac: '998314',
      amount: { amount: 2000, currency: 'INR' },
      quantity: 1,
      pricingMode: 'EXCLUSIVE',
    },
  ],
  calculationDate: '2026-04-01',
});

console.log(result.totalTax.amount); // document total tax
console.log(result.lines);           // per-item outcomes (when items.length > 1)
```

Other countries:

```ts
new Tax('AE')
new Tax('US')
```

Unknown country → `INVALID_COUNTRY` at construction.

---

## India

### Config

```ts
new Tax('IN', { stateCodeSource: 'GSTIN' }) // derive state from GSTIN
new Tax('IN', { stateCodeSource: 'STATE' }) // use seller.state / buyer.state (default)
```

| Rule | Behavior |
|------|----------|
| Registration | GSTIN present → registered |
| GSTIN vs `state` | mismatch → `INVALID_INPUT` |
| `items` | non-empty array, same currency |

### Place of supply

1. `placeOfSupplyState` — explicit override  
2. Goods: `deliveryState`, else buyer state  
3. Services: SAC-family rules, else buyer state  

### Schedule subset

Full HSN/SAC schedule loads by default (lazy shards). For a subset:

```ts
import { INDIA_FULL_SCHEDULE_INDEX, pickIndiaSchedule } from 'tax-engine/in/schedule';

const tax = new Tax('IN', {
  schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
    hsn: ['8471'],
    sac: ['998314'],
  }),
});
```

Rates may lag CBIC — verify before production use.

---

## UAE / US

Sample-limited (`details.limitedSupport: true`).

| Country | Notes |
|---------|--------|
| `AE` | `GENERAL` / `CONSULTING` → 5% VAT; `ZERO` → 0% |
| `US` | Requires `jurisdiction.state` (e.g. `CA`) |

---

## Result shape

```ts
{
  country: string
  taxability: string
  chargeMode: 'FORWARD_CHARGE' | 'REVERSE_CHARGE' | 'MIXED'
  liabilityParty: 'SELLER' | 'BUYER' | 'NONE' | 'MIXED'
  currency: string
  pricingMode: 'EXCLUSIVE' | 'INCLUSIVE' | 'MIXED'
  originalAmount / taxableAmount / totalTax / finalAmount: Money
  taxes: Array<{ type, rate, taxableBase, amount, name? }>
  lines?: TaxOutcome[]   // India, when items.length > 1
  details?: object
}
```

---

## Errors

| Code | When |
|------|------|
| `INVALID_COUNTRY` | Unsupported country code |
| `INVALID_INPUT` | Bad GSTIN, state, PoS, or `items` |
| `NO_RULE_FOUND` | Unknown HSN/SAC or category |
| `UNSUPPORTED_CASE` | Composition, SEZ, non-invoice docs, etc. |

---

## License

MIT
