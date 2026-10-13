# @kabawat/tax-engine

Framework-agnostic tax calculation SDK for **India GST**, **UAE VAT**, and **US sales tax**.

- Node.js 18+
- ESM only
- Zero runtime dependencies
- TypeScript types included

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

## Features

| Area | Support |
|------|---------|
| Countries | `IN` (full), `AE` / `US` (sample / limited) |
| India GST heads | CGST, SGST, UTGST, IGST, CESS (ad-valorem) |
| HSN / SAC schedule | Full CBIC-style schedule (lazy shards) |
| Pricing | `EXCLUSIVE` / `INCLUSIVE` |
| Discounts | Fixed / percentage, before-tax / after-tax |
| Place of supply | Goods + services (SAC-family rules) |
| Charge mode | Forward charge, reverse charge (caller-flagged RCM) |
| GSTIN | Validate, parse, checksum, state from GSTIN |
| State codes | Numeric (`24`) ↔ alpha (`GJ`) |
| Taxability | TAXABLE, NIL_RATED, EXEMPT, NON_GST, ZERO_RATED |
| Documents | Invoice (credit/debit/advance flagged; some cases unsupported) |

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

console.log(result.totalTax.amount);
console.log(result.taxes);
console.log(result.lines);
```

Other countries:

```ts
new Tax('AE');
new Tax('US');
```

Unknown country → `INVALID_COUNTRY` at construction.

---

## Package entry points

| Import | Purpose |
|--------|---------|
| `@kabawat/tax-engine` | Main API (`Tax`, GSTIN helpers, discounts, errors) |
| `@kabawat/tax-engine/in/schedule` | India HSN/SAC schedule index & helpers |
| `@kabawat/tax-engine/rules/india` | Legacy / sample India rule sets |
| `@kabawat/tax-engine/rules/usa` | Sample US rules |
| `@kabawat/tax-engine/rules/uae` | Sample UAE rules |

---

## India GST

### Config

```ts
new Tax('IN', { stateCodeSource: 'GSTIN' }); // derive state from GSTIN when present
new Tax('IN', { stateCodeSource: 'STATE' }); // require seller.state / buyer.state (default)
new Tax('IN', { discountMode: 'BEFORE_TAX' }); // default discount mode for lines
```

Optional overrides:

- `schedule` — custom or subset schedule
- `serviceFamilyRules` — SAC-family place-of-supply table
- `placeOfSupplyRules` — full PoS rule list

| Rule | Behavior |
|------|----------|
| Registration | GSTIN present → registered seller/buyer |
| GSTIN vs `state` | Mismatch → `INVALID_INPUT` |
| `items` | Non-empty, same currency |
| `reverseCharge: true` | Caller RCM context → `REVERSE_CHARGE` / buyer liability (same heads/math; no 9(3)/9(4)/9(5) auto-detect) |

### Seller / buyer parties

```ts
seller: { gstin?: string; state?: string; taxpayerType?: 'REGULAR' | 'COMPOSITION'; customerType?: 'B2B' | 'B2C' | 'SEZ' }
buyer:  { gstin?: string; state?: string; taxpayerType?: ...; customerType?: ... }
```

Typical patterns:

```ts
// B2B interstate
seller: { gstin: '29AABCU9603R1ZJ' }
buyer:  { gstin: '27AABCU9603R1ZN' }

// B2C same state (counter / walk-in) — no buyer GSTIN
seller: { gstin: '24AAAAA0000A1Z8' }
buyer:  { state: 'GJ' }

// B2C other state (online delivery)
seller: { gstin: '24AAAAA0000A1Z8' }
buyer:  { state: 'MH' }
```

Same state → CGST + SGST (or CGST + UTGST for union territories).  
Different state → IGST.

Composition / SEZ cases may throw `UNSUPPORTED_CASE`.

### Line items

```ts
{
  type: 'PRODUCT' | 'SERVICE',
  hsn?: string,              // PRODUCT
  sac?: string,              // SERVICE
  amount: { amount: number; currency: 'INR' },
  quantity: number,
  pricingMode: 'EXCLUSIVE' | 'INCLUSIVE',
  discount?: {
    type: 'FIXED' | 'PERCENTAGE',
    value: number,
    mode?: 'BEFORE_TAX' | 'AFTER_TAX',
  },
  placeOfSupplyState?: string,
  deliveryState?: string,
  reverseCharge?: boolean,
}
```

Document-level fields:

```ts
{
  seller, buyer, items,
  calculationDate: 'YYYY-MM-DD',
  documentType?: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'ADVANCE',
  reverseCharge?: boolean,
}
```

### Discounts

```ts
import { DiscountMode, DiscountType } from '@kabawat/tax-engine';

items: [{
  // ...
  discount: { type: DiscountType.FIXED, value: 100, mode: DiscountMode.BEFORE_TAX },
}]
```

- `BEFORE_TAX` — discount reduces taxable base, then GST
- `AFTER_TAX` — GST on full amount, discount applied after
- Line `mode` overrides constructor `discountMode` (default `BEFORE_TAX`)

### Place of supply

Resolution order:

1. Item `placeOfSupplyState` (explicit)
2. Goods: `deliveryState`, else buyer state
3. Services: SAC-family rules, else buyer state

### GSTIN utilities

```ts
import {
  validateGSTIN,
  parseGSTIN,
  getStateFromGSTIN,
  isValidGSTIN,
  normalizeGstin,
  gstinChecksumDigit,
} from '@kabawat/tax-engine';

validateGSTIN('29aabcu9603r1zj');     // → '29AABCU9603R1ZJ'
isValidGSTIN('29AABCU9603R1ZJ');      // → true
parseGSTIN('29AABCU9603R1ZJ');        // state, PAN, entity, checksum, …
getStateFromGSTIN('29AABCU9603R1ZJ'); // → 'KA'
```

Offline only (no GST portal API). Invalid format / state / checksum → `INVALID_INPUT`.

### State code utilities

```ts
import {
  resolveIndiaStateCode,
  GSTIN_STATE_CODES,
  isKnownIndiaState,
  isUnionTerritoryWithUtgst,
  normalizeIndiaState,
  INDIA_UTGST_STATES,
} from '@kabawat/tax-engine';

resolveIndiaStateCode('24');  // → 'GJ'
resolveIndiaStateCode('gj');  // → 'GJ'
resolveIndiaStateCode('7');   // → 'DL'
GSTIN_STATE_CODES['27'];      // → 'MH'
isUnionTerritoryWithUtgst('CH'); // → true (CGST+UTGST)
```

### HSN / SAC schedule

Full schedule loads by default (lazy shards). Subset:

```ts
import {
  INDIA_FULL_SCHEDULE_INDEX,
  pickIndiaSchedule,
  resolveScheduleEntry,
  validateIndiaGstRate,
  buildScheduleIndex,
} from '@kabawat/tax-engine/in/schedule';

const tax = new Tax('IN', {
  schedule: pickIndiaSchedule(INDIA_FULL_SCHEDULE_INDEX, {
    hsn: ['8471'],
    sac: ['998314'],
  }),
});

const rate = resolveScheduleEntry('6403', 'HSN', '2026-04-01', INDIA_FULL_SCHEDULE_INDEX);
// { code, ratePercent, taxability, effectiveFrom, … }
```

Also exported: `INDIA_FULL_SCHEDULE`, `INDIA_FULL_SCHEDULE_META`, `INDIA_SCHEDULE_INTEGRITY`, `hsnLookupCandidates`, `sacLookupCandidates`, `scheduleLookupKey`, `assertRateHistoryIntegrity`, `assertResolvedIndiaRate`.

Rates may lag CBIC — verify before production use.

### Taxability

Classification comes from the HSN/SAC schedule. `calculate()` does not accept a caller taxability override; use `validateIndiaGstRate({ taxability })` to assert a match.

| Kind | Meaning | Tax heads |
|------|---------|-----------|
| `TAXABLE` | GST at schedule slab | CGST+SGST/UTGST or IGST; optional CESS |
| `NIL_RATED` | Nil-rated | `taxes: []` |
| `EXEMPT` | Exempt | `taxes: []` |
| `NON_GST` | Outside GST | `taxes: []` |
| `ZERO_RATED` | Zero-rated label | `taxes: []` (charge mode still resolved) |

`TAXABLE` at `ratePercent: 0` (custom schedule) emits zero-amount GST heads — not the same as NIL/EXEMPT/NON_GST empty `taxes`.

Helpers:

```ts
import { carriesGstHeads, isNilExemptOrNonGst, resolveTaxability } from '@kabawat/tax-engine';
```

### Tax heads

```ts
import { IndiaTaxHead, selectIndiaTaxHeads, withIndiaCessHead } from '@kabawat/tax-engine';
// CGST | SGST | UTGST | IGST | CESS
```

### Cess

Ad-valorem only via schedule `cessRatePercent` on **TAXABLE** periods. Bundled schedule rows currently omit cess; set it on custom / `pickIndiaSchedule` data when known. `totalTax` includes cess. Fixed / quantity cess is not supported.

### Rounding

Per-head amounts are rounded independently.  

`roundingDifference = totalTax − sum(taxes.amount)` (often ±0.01 for CGST+SGST). Apps choose how to post it.

---

## UAE / US

Sample-limited (`details.limitedSupport: true`).

| Country | Notes |
|---------|--------|
| `AE` | Categories `GENERAL` / `CONSULTING` → 5% VAT; `ZERO` → 0% |
| `US` | Requires `jurisdiction.state` (e.g. `CA`) |

---

## Result shape (`TaxOutcome`)

```ts
{
  country: string
  taxability: string
  chargeMode: 'FORWARD_CHARGE' | 'REVERSE_CHARGE' | 'MIXED'
  liabilityParty: 'SELLER' | 'BUYER' | 'NONE' | 'MIXED'
  currency: string
  pricingMode: 'EXCLUSIVE' | 'INCLUSIVE' | 'MIXED'
  originalAmount: Money
  taxableAmount: Money
  totalTax: Money
  finalAmount: Money
  roundingDifference: Money
  taxes: Array<{ type, rate, taxableBase, amount, name? }>
  discount?: AppliedDiscount
  lines?: TaxOutcome[]   // India, when items.length > 1
  details?: object
}
```

`Money` = `{ amount: number; currency: string }`.

---

## Errors

```ts
import { TaxEngineError, TaxEngineErrorCode } from '@kabawat/tax-engine';

try {
  tax.calculate(input);
} catch (e) {
  if (e instanceof TaxEngineError) {
    console.error(e.code, e.details);
  }
}
```

| Code | When |
|------|------|
| `INVALID_COUNTRY` | Unsupported country |
| `INVALID_INPUT` | Bad GSTIN, state, PoS, or `items` |
| `INVALID_TAX_INPUT` | Invalid tax input structure |
| `INVALID_AMOUNT` / `INVALID_CURRENCY` / `INVALID_DATE` | Bad money / date |
| `INVALID_TAX_RATE` / `INVALID_TAX_RULE` | Bad rate / rule |
| `NO_RULE_FOUND` | Unknown HSN/SAC or category |
| `UNSUPPORTED_CASE` | Composition, SEZ, non-invoice docs, etc. |

---

## Main exports (reference)

```ts
import Tax, {
  // Core
  SupportedCountry, ChargeMode, LiabilityParty, PricingMode, RoundingMode,
  ItemType, KnownTaxType, TaxRateBasis,
  TaxEngineError, TaxEngineErrorCode,

  // India
  StateCodeSources, IndiaTaxHead, IndiaTaxability,
  IndiaTaxpayerType, IndiaCustomerType, SupplyKind,
  validateGSTIN, parseGSTIN, getStateFromGSTIN, isValidGSTIN,
  resolveIndiaStateCode, GSTIN_STATE_CODES,
  isKnownIndiaState, isUnionTerritoryWithUtgst,
  carriesGstHeads, isNilExemptOrNonGst, resolveTaxability,
  selectIndiaTaxHeads, withIndiaCessHead,

  // Discount
  DiscountMode, DiscountType, resolveDiscountMode,

  // Validators
  validateTaxInput, validateTaxRule, validateTaxRules,
  DefaultTaxRuleValidator,
} from '@kabawat/tax-engine';
```

---

## Scripts (repo)

```bash
npm test                 # vitest
npm run build            # schedule generate + tsc + shards + obfuscate
npm run typecheck
npm run manual-test      # examples/manual-test.mjs
npm run verify           # typecheck + test + build + pack dry-run
```

---

## Keywords

`tax-engine`, `tax-calculator`, `gst`, `vat`, `sales-tax`, `hsn`, `sac`, `javascript`, `typescript`

## License

MIT
