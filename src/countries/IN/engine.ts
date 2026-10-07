import {
  ChargeMode,
  LiabilityParty,
  type CountryTaxCalculator,
  type CountryTaxLine,
  type TaxOutcome,
} from '../../core/country/types.js';
import type { DiscountMode } from '../../discount/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { PricingMode } from '../../models/pricing-mode.js';
import type { Money } from '../../models/money.js';
import { money, roundAmount, sumMoneyAmounts } from '../../money/operations.js';
import { resolveChargeMode } from './charge-mode.js';
import {
  calculateIndiaGstLineAmounts,
  computeRoundingDifference,
} from './gst-line-amounts.js';
import type {
  IndiaItemInput,
  IndiaTaxConfig,
  IndiaTaxInput,
  ResolvedIndiaParty,
} from './parties.js';
import { StateCodeSource } from './parties.js';
import { resolveIndiaParty } from './party-resolution.js';
import {
  createDefaultPlaceOfSupplyRules,
  resolvePlaceOfSupply,
  type PlaceOfSupplyRule,
} from './place-of-supply/index.js';
import {
  resolveScheduleEntry,
  type IndiaScheduleIndex,
  type IndiaScheduleEntry,
} from './schedules/index.js';
import { INDIA_FULL_SCHEDULE_INDEX } from './schedules/full.js';
import { assertResolvedIndiaRate } from './validate-gst-rate.js';
import { selectIndiaTaxHeads, withIndiaCessHead } from './tax-heads.js';
import { carriesGstHeads, isNilExemptOrNonGst } from './taxability.js';
import { IndiaTaxability } from './types.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function reject(message: string, details?: unknown): never {
  throw new TaxEngineError(message, {
    code: TaxEngineErrorCode.INVALID_INPUT,
    details,
  });
}

function validateIndiaItem(item: IndiaItemInput, index: number): void {
  const field = (name: string) => `items[${index}].${name}`;

  if (item.type !== 'PRODUCT' && item.type !== 'SERVICE') {
    reject('item.type must be PRODUCT or SERVICE', { field: field('type') });
  }

  if (
    item.pricingMode !== PricingMode.EXCLUSIVE &&
    item.pricingMode !== PricingMode.INCLUSIVE
  ) {
    reject('item.pricingMode is invalid', { field: field('pricingMode') });
  }

  if (!Number.isFinite(item.amount.amount) || item.amount.amount < 0) {
    reject('item.amount.amount must be a non-negative finite number', {
      field: field('amount.amount'),
    });
  }
  if (!item.amount.currency.trim()) {
    reject('item.amount.currency is required', { field: field('amount.currency') });
  }
  if (!Number.isFinite(item.quantity) || item.quantity < 0) {
    reject('item.quantity must be a non-negative finite number', {
      field: field('quantity'),
    });
  }
}

function validateIndiaInput(input: IndiaTaxInput): void {
  if (!isValidIsoDate(input.calculationDate)) {
    reject('calculationDate must be a valid ISO date (YYYY-MM-DD)', {
      field: 'calculationDate',
    });
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    reject('items must be a non-empty array', { field: 'items' });
  }

  for (let i = 0; i < input.items.length; i += 1) {
    validateIndiaItem(input.items[i]!, i);
  }

  const currency = input.items[0]!.amount.currency.trim();
  for (let i = 1; i < input.items.length; i += 1) {
    if (input.items[i]!.amount.currency.trim() !== currency) {
      reject('All items must use the same currency', {
        field: `items[${i}].amount.currency`,
      });
    }
  }

  if (input.documentType !== undefined && input.documentType !== 'INVOICE') {
    throw new TaxEngineError(
      `Document type ${input.documentType} is not supported yet`,
      {
        code: TaxEngineErrorCode.UNSUPPORTED_CASE,
        details: { documentType: input.documentType },
      },
    );
  }
}

function resolveCodeKind(
  item: IndiaItemInput,
  index: number,
): { code: string; kind: 'HSN' | 'SAC' } {
  const field = (name: string) => `items[${index}].${name}`;
  if (item.type === 'PRODUCT') {
    if (!item.hsn || !item.hsn.trim()) {
      reject('HSN is required for PRODUCT supplies', { field: field('hsn') });
    }
    return { code: item.hsn.trim(), kind: 'HSN' };
  }
  if (!item.sac || !item.sac.trim()) {
    reject('SAC is required for SERVICE supplies', { field: field('sac') });
  }
  return { code: item.sac.trim(), kind: 'SAC' };
}

function sumMoney(values: readonly Money[], currency: string): Money {
  return money(
    roundAmount(sumMoneyAmounts(values.map((v) => v.amount))),
    currency,
  );
}

function mergeTaxes(lines: readonly TaxOutcome[], currency: string): CountryTaxLine[] {
  const byKey = new Map<string, CountryTaxLine>();
  for (const line of lines) {
    for (const tax of line.taxes) {
      const key = `${tax.type}:${tax.rate}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, {
          type: tax.type,
          rate: tax.rate,
          taxableBase: { ...tax.taxableBase },
          amount: { ...tax.amount },
          ...(tax.name !== undefined ? { name: tax.name } : {}),
        });
        continue;
      }
      byKey.set(key, {
        ...existing,
        taxableBase: money(
          roundAmount(existing.taxableBase.amount + tax.taxableBase.amount),
          currency,
        ),
        amount: money(roundAmount(existing.amount.amount + tax.amount.amount), currency),
      });
    }
  }
  return [...byKey.values()];
}

function sameOrMixed(values: readonly string[]): string {
  const first = values[0]!;
  return values.every((v) => v === first) ? first : 'MIXED';
}

function zeroRounding(currency: string): Money {
  return money(0, currency);
}

export class IndiaGSTEngine implements CountryTaxCalculator<IndiaTaxInput> {
  readonly country = 'IN';
  private readonly stateCodeSource: StateCodeSource;
  private readonly discountMode: DiscountMode | undefined;
  private readonly schedule: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
  private readonly placeOfSupplyRules: readonly PlaceOfSupplyRule[];

  constructor(config: IndiaTaxConfig = {}) {
    this.stateCodeSource = config.stateCodeSource ?? StateCodeSource.STATE;
    this.discountMode = config.discountMode;
    this.schedule = config.schedule ?? INDIA_FULL_SCHEDULE_INDEX;
    this.placeOfSupplyRules =
      config.placeOfSupplyRules ??
      createDefaultPlaceOfSupplyRules(config.serviceFamilyRules);
  }

  calculate(input: IndiaTaxInput): TaxOutcome {
    validateIndiaInput(input);

    const seller = resolveIndiaParty(input.seller, 'seller', this.stateCodeSource);
    const buyer = resolveIndiaParty(input.buyer, 'buyer', this.stateCodeSource);

    const lines = input.items.map((item, index) =>
      this.calculateItem(input, seller, buyer, item, index),
    );

    if (lines.length === 1) {
      return lines[0]!;
    }

    const currency = lines[0]!.currency;
    const taxes = mergeTaxes(lines, currency);
    const totalTax = sumMoney(
      lines.map((l) => l.totalTax),
      currency,
    );

    return {
      country: 'IN',
      taxability: sameOrMixed(lines.map((l) => l.taxability)),
      chargeMode: sameOrMixed(lines.map((l) => l.chargeMode)) as ChargeMode | 'MIXED',
      liabilityParty: sameOrMixed(lines.map((l) => l.liabilityParty)) as
        | typeof LiabilityParty[keyof typeof LiabilityParty]
        | 'MIXED',
      currency,
      pricingMode: sameOrMixed(lines.map((l) => l.pricingMode)) as PricingMode | 'MIXED',
      originalAmount: sumMoney(
        lines.map((l) => l.originalAmount),
        currency,
      ),
      taxableAmount: sumMoney(
        lines.map((l) => l.taxableAmount),
        currency,
      ),
      taxes,
      totalTax,
      roundingDifference: computeRoundingDifference(totalTax, taxes),
      finalAmount: sumMoney(
        lines.map((l) => l.finalAmount),
        currency,
      ),
      lines,
      details: {
        supplierState: seller.state,
        buyerState: buyer.state,
        stateCodeSource: this.stateCodeSource,
        supplierStateSource: seller.stateSource,
        buyerStateSource: buyer.stateSource,
        lineCount: lines.length,
      },
    };
  }

  private calculateItem(
    input: IndiaTaxInput,
    seller: ResolvedIndiaParty,
    buyer: ResolvedIndiaParty,
    item: IndiaItemInput,
    index: number,
  ): TaxOutcome {
    const { code, kind } = resolveCodeKind(item, index);
    const resolved = resolveScheduleEntry(
      code,
      kind,
      input.calculationDate,
      this.schedule,
    );
    if (resolved === undefined) {
      throw new TaxEngineError(`No India GST schedule entry for ${kind} ${code}`, {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: { kind, code, calculationDate: input.calculationDate, itemIndex: index },
      });
    }
    const schedule = assertResolvedIndiaRate(resolved, {
      kind,
      code,
      calculationDate: input.calculationDate,
      itemIndex: index,
    });

    const taxability = schedule.taxability;
    const placeOfSupply = resolvePlaceOfSupply(
      {
        seller,
        buyer,
        item,
      },
      this.placeOfSupplyRules,
    );

    const charge = resolveChargeMode({ seller, buyer, schedule });

    const currency = item.amount.currency;
    const pricingMode = item.pricingMode;

    const baseDetails = {
      placeOfSupply,
      scheduleCode: schedule.code,
      scheduleKind: schedule.kind,
      supplierState: seller.state,
      buyerState: buyer.state,
      stateCodeSource: this.stateCodeSource,
      supplierStateSource: seller.stateSource,
      buyerStateSource: buyer.stateSource,
      itemIndex: index,
    };

    const noTaxLine = () =>
      calculateIndiaGstLineAmounts({
        amount: item.amount.amount,
        quantity: item.quantity,
        currency,
        pricingMode,
        totalRatePercent: 0,
        heads: [],
        ...(item.discount !== undefined ? { discount: item.discount } : {}),
        ...(this.discountMode !== undefined
          ? { configDiscountMode: this.discountMode }
          : {}),
      });

    if (isNilExemptOrNonGst(taxability)) {
      const computed = noTaxLine();
      return {
        country: 'IN',
        taxability,
        chargeMode: ChargeMode.FORWARD_CHARGE,
        liabilityParty: LiabilityParty.NONE,
        currency,
        pricingMode,
        originalAmount: computed.originalAmount,
        taxableAmount: computed.taxableAmount,
        taxes: [],
        totalTax: computed.totalTax,
        roundingDifference: zeroRounding(currency),
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: baseDetails,
      };
    }

    if (taxability === IndiaTaxability.ZERO_RATED) {
      const computed = noTaxLine();
      return {
        country: 'IN',
        taxability,
        chargeMode: charge.chargeMode,
        liabilityParty: charge.levyTax ? charge.liabilityParty : LiabilityParty.NONE,
        currency,
        pricingMode,
        originalAmount: computed.originalAmount,
        taxableAmount: computed.taxableAmount,
        taxes: [],
        totalTax: computed.totalTax,
        roundingDifference: zeroRounding(currency),
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: baseDetails,
      };
    }

    if (!carriesGstHeads(taxability)) {
      throw new TaxEngineError('Unsupported taxability for India GST calculation', {
        code: TaxEngineErrorCode.UNSUPPORTED_CASE,
        details: { taxability, itemIndex: index },
      });
    }

    if (!charge.levyTax) {
      const computed = noTaxLine();
      return {
        country: 'IN',
        taxability: IndiaTaxability.TAXABLE,
        chargeMode: charge.chargeMode,
        liabilityParty: charge.liabilityParty,
        currency,
        pricingMode,
        originalAmount: computed.originalAmount,
        taxableAmount: computed.taxableAmount,
        taxes: [],
        totalTax: computed.totalTax,
        roundingDifference: zeroRounding(currency),
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: {
          ...baseDetails,
          reason: 'NO_FORWARD_CHARGE',
        },
      };
    }

    const heads = withIndiaCessHead(
      selectIndiaTaxHeads({
        supplierState: seller.state,
        placeOfSupplyState: placeOfSupply.state,
        totalRatePercent: schedule.ratePercent,
      }),
      schedule.cessRatePercent,
    );

    if (heads.length === 0) {
      throw new TaxEngineError('Unable to determine India GST tax heads', {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: baseDetails,
      });
    }

    const computed = calculateIndiaGstLineAmounts({
      amount: item.amount.amount,
      quantity: item.quantity,
      currency,
      pricingMode,
      totalRatePercent: schedule.ratePercent,
      heads,
      ...(item.discount !== undefined ? { discount: item.discount } : {}),
      ...(this.discountMode !== undefined
        ? { configDiscountMode: this.discountMode }
        : {}),
    });

    return {
      country: 'IN',
      taxability: IndiaTaxability.TAXABLE,
      chargeMode: charge.chargeMode,
      liabilityParty: charge.liabilityParty,
      currency,
      pricingMode,
      originalAmount: computed.originalAmount,
      taxableAmount: computed.taxableAmount,
      taxes: computed.taxes,
      totalTax: computed.totalTax,
      roundingDifference: computed.roundingDifference,
      finalAmount: computed.finalAmount,
      ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
      details: {
        ...baseDetails,
        reverseCharge: charge.chargeMode === ChargeMode.REVERSE_CHARGE,
      },
    };
  }
}
