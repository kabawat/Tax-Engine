import {
  ChargeMode,
  LiabilityParty,
  type CountryTaxCalculator,
  type TaxOutcome,
} from '../../core/country/types.js';
import { calculateLineWithDiscount } from '../../discount/calculate-with-discount.js';
import type { DiscountMode } from '../../discount/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { PricingMode } from '../../models/pricing-mode.js';
import { TaxRateBasis, type TaxRule } from '../../models/tax-rule.js';
import { resolveChargeMode } from './charge-mode.js';
import type { IndiaTaxConfig, IndiaTaxInput } from './parties.js';
import { StateCodeSource } from './parties.js';
import { resolveIndiaParty } from './party-resolution.js';
import { resolvePlaceOfSupply } from './place-of-supply/index.js';
import {
  resolveScheduleEntry,
  type IndiaScheduleIndex,
  type IndiaScheduleEntry,
} from './schedules/index.js';
import { INDIA_FULL_SCHEDULE_INDEX } from './schedules/full.js';
import { selectIndiaTaxHeads } from './tax-heads.js';
import { carriesGstHeads } from './taxability.js';
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

function validateIndiaInput(input: IndiaTaxInput): void {
  if (!isValidIsoDate(input.calculationDate)) {
    reject('calculationDate must be a valid ISO date (YYYY-MM-DD)', {
      field: 'calculationDate',
    });
  }

  if (input.item.type !== 'PRODUCT' && input.item.type !== 'SERVICE') {
    reject('item.type must be PRODUCT or SERVICE', { field: 'item.type' });
  }

  if (
    input.item.pricingMode !== PricingMode.EXCLUSIVE &&
    input.item.pricingMode !== PricingMode.INCLUSIVE
  ) {
    reject('item.pricingMode is invalid', { field: 'item.pricingMode' });
  }

  if (!Number.isFinite(input.item.amount.amount) || input.item.amount.amount < 0) {
    reject('item.amount.amount must be a non-negative finite number', {
      field: 'item.amount.amount',
    });
  }
  if (!input.item.amount.currency.trim()) {
    reject('item.amount.currency is required', { field: 'item.amount.currency' });
  }
  if (!Number.isFinite(input.item.quantity) || input.item.quantity < 0) {
    reject('item.quantity must be a non-negative finite number', {
      field: 'item.quantity',
    });
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

function resolveCodeKind(input: IndiaTaxInput): { code: string; kind: 'HSN' | 'SAC' } {
  if (input.item.type === 'PRODUCT') {
    if (!input.item.hsn || !input.item.hsn.trim()) {
      reject('HSN is required for PRODUCT supplies', { field: 'item.hsn' });
    }
    return { code: input.item.hsn.trim(), kind: 'HSN' };
  }
  if (!input.item.sac || !input.item.sac.trim()) {
    reject('SAC is required for SERVICE supplies', { field: 'item.sac' });
  }
  return { code: input.item.sac.trim(), kind: 'SAC' };
}

function toSyntheticRules(
  heads: readonly { type: string; ratePercent: number }[],
): TaxRule[] {
  return heads.map((head, index) => ({
    id: `in-${head.type.toLowerCase()}-${index}`,
    name: head.type,
    taxType: head.type,
    rate: { value: head.ratePercent, basis: TaxRateBasis.PERCENTAGE },
    category: 'GENERAL',
    jurisdiction: { country: 'IN' },
    effective: { effectiveFrom: '2017-07-01' },
    priority: index + 1,
    compound: { isCompound: false },
    taxableBase: {},
  }));
}

function toOutcomeTaxes(
  taxes: ReturnType<typeof calculateLineWithDiscount>['taxes'],
): TaxOutcome['taxes'] {
  return taxes.map((line) => ({
    type: String(line.taxType),
    rate: line.rate.value,
    taxableBase: line.taxableBase,
    amount: line.taxAmount,
    name: line.taxName,
  }));
}

export class IndiaGSTEngine implements CountryTaxCalculator<IndiaTaxInput> {
  readonly country = 'IN';
  private readonly stateCodeSource: StateCodeSource;
  private readonly discountMode: DiscountMode | undefined;
  private readonly schedule: IndiaScheduleIndex | readonly IndiaScheduleEntry[];

  constructor(config: IndiaTaxConfig = {}) {
    this.stateCodeSource = config.stateCodeSource ?? StateCodeSource.STATE;
    this.discountMode = config.discountMode;
    this.schedule = config.schedule ?? INDIA_FULL_SCHEDULE_INDEX;
  }

  calculate(input: IndiaTaxInput): TaxOutcome {
    validateIndiaInput(input);

    const seller = resolveIndiaParty(input.seller, 'seller', this.stateCodeSource);
    const buyer = resolveIndiaParty(input.buyer, 'buyer', this.stateCodeSource);

    const { code, kind } = resolveCodeKind(input);
    const schedule = resolveScheduleEntry(
      code,
      kind,
      input.calculationDate,
      this.schedule,
    );
    if (schedule === undefined) {
      throw new TaxEngineError(`No India GST schedule entry for ${kind} ${code}`, {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: { kind, code, calculationDate: input.calculationDate },
      });
    }

    const taxability = schedule.taxability;
    const placeOfSupply = resolvePlaceOfSupply({
      seller,
      buyer,
      item: input.item,
    });

    const charge = resolveChargeMode({ seller, buyer, schedule });

    const currency = input.item.amount.currency;
    const pricingMode = input.item.pricingMode;

    const baseDetails = {
      placeOfSupply,
      scheduleCode: schedule.code,
      scheduleKind: schedule.kind,
      supplierState: seller.state,
      buyerState: buyer.state,
      stateCodeSource: this.stateCodeSource,
      supplierStateSource: seller.stateSource,
      buyerStateSource: buyer.stateSource,
    };

    const lineCalc = (rules: readonly TaxRule[]) =>
      calculateLineWithDiscount({
        amount: input.item.amount.amount,
        currency,
        quantity: input.item.quantity,
        pricingMode,
        rules,
        calculationDate: input.calculationDate,
        itemType: input.item.type,
        ...(input.item.discount !== undefined ? { discount: input.item.discount } : {}),
        ...(this.discountMode !== undefined
          ? { configDiscountMode: this.discountMode }
          : {}),
      });

    if (
      taxability === IndiaTaxability.EXEMPT ||
      taxability === IndiaTaxability.NIL_RATED ||
      taxability === IndiaTaxability.NON_GST
    ) {
      const computed = lineCalc([]);
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
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: baseDetails,
      };
    }

    if (taxability === IndiaTaxability.ZERO_RATED) {
      const computed = lineCalc([]);
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
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: baseDetails,
      };
    }

    if (!carriesGstHeads(taxability)) {
      throw new TaxEngineError('Unsupported taxability for India GST calculation', {
        code: TaxEngineErrorCode.UNSUPPORTED_CASE,
        details: { taxability },
      });
    }

    if (!charge.levyTax) {
      const computed = lineCalc([]);
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
        finalAmount: computed.finalAmount,
        ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
        details: {
          ...baseDetails,
          reason: 'NO_FORWARD_CHARGE',
        },
      };
    }

    const heads = selectIndiaTaxHeads({
      supplierState: seller.state,
      placeOfSupplyState: placeOfSupply.state,
      totalRatePercent: schedule.ratePercent,
    });

    if (heads.length === 0) {
      throw new TaxEngineError('Unable to determine India GST tax heads', {
        code: TaxEngineErrorCode.NO_RULE_FOUND,
        details: baseDetails,
      });
    }

    const computed = lineCalc(toSyntheticRules(heads));

    return {
      country: 'IN',
      taxability: IndiaTaxability.TAXABLE,
      chargeMode: charge.chargeMode,
      liabilityParty: charge.liabilityParty,
      currency,
      pricingMode,
      originalAmount: computed.originalAmount,
      taxableAmount: computed.taxableAmount,
      taxes: toOutcomeTaxes(computed.taxes),
      totalTax: computed.totalTax,
      finalAmount: computed.finalAmount,
      ...(computed.discount !== undefined ? { discount: computed.discount } : {}),
      details: {
        ...baseDetails,
        reverseCharge: charge.chargeMode === ChargeMode.REVERSE_CHARGE,
      },
    };
  }
}
