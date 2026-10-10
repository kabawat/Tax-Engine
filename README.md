# @kabawat/tax-engine

Multi-country tax calculation SDK for Node.js and TypeScript — India GST, UAE VAT, US sales tax.

- Node.js 18+
- ESM
- Zero runtime dependencies

---

## Install

```bash
npm install @kabawat/tax-engine
```

```bash
yarn add @kabawat/tax-engine
```

```bash
pnpm add @kabawat/tax-engine
```

---

## Quick start

```ts
import Tax from '@kabawat/tax-engine';

const tax = new Tax('IN', { stateCodeSource: 'GSTIN' });

const result = tax.calculate({
  seller: { gstin: '29AABCU9603R1ZJ' },
  buyer: { gstin: '27AABCU9603R1ZN' },
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
| `reverseCharge: true` | Caller RCM context → `REVERSE_CHARGE` / buyer liability; same tax heads/math (no 9(3)/9(4)/9(5) detection) |

### GSTIN utilities

```ts
import { validateGSTIN, parseGSTIN, getStateFromGSTIN } from '@kabawat/tax-engine';

validateGSTIN('29aabcu9603r1zj'); // → '29AABCU9603R1ZJ' (trim, case, format, state, checksum)
parseGSTIN('29AABCU9603R1ZJ');    // state, PAN, entity fields, …
getStateFromGSTIN('29AABCU9603R1ZJ'); // → 'KA'
```

Offline only (no GST portal API). Invalid format/state/checksum → `INVALID_INPUT`.

### Place of supply

1. `placeOfSupplyState` — explicit override  
2. Goods: `deliveryState`, else buyer state  
3. Services: SAC-family rules, else buyer state  

### Schedule subset

Full HSN/SAC schedule loads by default (lazy shards). For a subset:

```ts
import { INDIA_FULL_SCHEDULE_INDEX, pickIndiaSchedule } from '@kabawat/tax-engine/in/schedule';

const tax = new Tax('IN', {
  schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
    hsn: ['8471'],
    sac: ['998314'],
  }),
});
```

Rates may lag CBIC — verify before production use.

### Taxability

Classification comes from the HSN/SAC schedule (`taxability` on the effective rate period). `calculate()` does not accept a caller override; use `validateIndiaGstRate({ taxability })` to assert a match.

| Kind | Meaning | Tax heads |
|------|---------|-----------|
| `TAXABLE` | GST supply at schedule slab | CGST+SGST/UTGST or IGST; optional `CESS` |
| `NIL_RATED` | Nil-rated GST supply | `taxes: []` |
| `EXEMPT` | Exempt supply | `taxes: []` |
| `NON_GST` | Outside GST | `taxes: []` |
| `ZERO_RATED` | Zero-rated label in schedule | `taxes: []` (charge mode still resolved) |

`TAXABLE` at `ratePercent: 0` (custom schedule) emits zero-amount GST heads — not the same as NIL/EXEMPT/NON_GST empty `taxes`.

### Cess

Ad-valorem only via optional schedule `cessRatePercent` on **TAXABLE** periods. Bundled schedule rows currently omit cess; set it on custom/`pickIndiaSchedule` data when known. `totalTax` includes cess; heads are not adjusted for `roundingDifference`. Fixed/quantity cess is not supported.

### Rounding

For multi-head GST, `totalTax` is the combined GST (plus cess when present). Per-head amounts are rounded independently. `roundingDifference = totalTax - sum(taxes.amount)` — usually ±0.01 for CGST+SGST; apps choose how to post it.

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
  roundingDifference: Money  // totalTax - sum(taxes.amount); heads not adjusted
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
