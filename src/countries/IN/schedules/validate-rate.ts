import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';
import { IndiaTaxability, type IndiaTaxability as IndiaTaxabilityType } from '../types.js';
import {
  resolveScheduleEntry,
  type IndiaScheduleEntry,
  type IndiaScheduleIndex,
  type ResolvedIndiaScheduleEntry,
} from './index.js';

// Shipped GST slabs observed in the bundled schedule
const KNOWN_GST_SLABS = new Set([0, 0.25, 3, 5, 12, 18, 28, 40]);

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidateIndiaGstRateInput {
  readonly kind: 'HSN' | 'SAC';
  readonly code: string;
  readonly calculationDate: string;
  readonly ratePercent?: number;
  readonly taxability?: IndiaTaxabilityType;
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function reject(
  message: string,
  code: TaxEngineErrorCode,
  details?: Record<string, unknown>,
): never {
  throw new TaxEngineError(message, { code, details });
}

// Validates taxability/rate consistency on a resolved schedule row
export function assertResolvedIndiaRate(
  resolved: ResolvedIndiaScheduleEntry,
  details?: Record<string, unknown>,
): ResolvedIndiaScheduleEntry {
  const { ratePercent, taxability } = resolved;

  if (!Number.isFinite(ratePercent) || ratePercent < 0) {
    reject(
      'Resolved GST ratePercent must be a non-negative finite number',
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        ...details,
        ratePercent,
        taxability,
        code: resolved.code,
        kind: resolved.kind,
      },
    );
  }

  const zeroRatedKinds: readonly IndiaTaxabilityType[] = [
    IndiaTaxability.EXEMPT,
    IndiaTaxability.NIL_RATED,
    IndiaTaxability.NON_GST,
    IndiaTaxability.ZERO_RATED,
  ];

  if (zeroRatedKinds.includes(taxability) && ratePercent !== 0) {
    reject(
      `Taxability ${taxability} requires ratePercent 0`,
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        ...details,
        ratePercent,
        taxability,
        code: resolved.code,
        kind: resolved.kind,
      },
    );
  }

  if (
    taxability === IndiaTaxability.TAXABLE &&
    !KNOWN_GST_SLABS.has(ratePercent)
  ) {
    reject(
      `TAXABLE ratePercent ${ratePercent} is not a known GST slab`,
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        ...details,
        ratePercent,
        taxability,
        code: resolved.code,
        kind: resolved.kind,
        knownSlabs: [...KNOWN_GST_SLABS],
      },
    );
  }

  if (
    resolved.cessRatePercent !== undefined &&
    (!Number.isFinite(resolved.cessRatePercent) || resolved.cessRatePercent < 0)
  ) {
    reject(
      'Resolved cessRatePercent must be a non-negative finite number',
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        ...details,
        cessRatePercent: resolved.cessRatePercent,
        code: resolved.code,
        kind: resolved.kind,
      },
    );
  }

  // Ad-valorem cess is only valid on TAXABLE schedule rows
  if (
    resolved.cessRatePercent !== undefined &&
    taxability !== IndiaTaxability.TAXABLE
  ) {
    reject(
      `cessRatePercent is only allowed for TAXABLE rows (got ${taxability})`,
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        ...details,
        cessRatePercent: resolved.cessRatePercent,
        taxability,
        code: resolved.code,
        kind: resolved.kind,
      },
    );
  }

  return resolved;
}

// Core validator; pass schedule or use validateIndiaGstRate from IN/validate-gst-rate
export function validateIndiaGstRateWithSchedule(
  input: ValidateIndiaGstRateInput & {
    readonly schedule: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
  },
): ResolvedIndiaScheduleEntry {
  const code = input.code?.trim() ?? '';
  if (!code) {
    reject('HSN/SAC code is required', TaxEngineErrorCode.INVALID_INPUT, {
      field: 'code',
    });
  }

  if (input.kind !== 'HSN' && input.kind !== 'SAC') {
    reject('kind must be HSN or SAC', TaxEngineErrorCode.INVALID_INPUT, {
      field: 'kind',
      kind: input.kind,
    });
  }

  if (!isValidIsoDate(input.calculationDate)) {
    reject(
      'calculationDate must be a valid ISO date (YYYY-MM-DD)',
      TaxEngineErrorCode.INVALID_INPUT,
      { field: 'calculationDate', calculationDate: input.calculationDate },
    );
  }

  const resolved = resolveScheduleEntry(
    code,
    input.kind,
    input.calculationDate,
    input.schedule,
  );

  if (resolved === undefined) {
    reject(
      `No India GST schedule entry for ${input.kind} ${code} on ${input.calculationDate}`,
      TaxEngineErrorCode.NO_RULE_FOUND,
      {
        kind: input.kind,
        code,
        calculationDate: input.calculationDate,
      },
    );
  }

  assertResolvedIndiaRate(resolved, {
    calculationDate: input.calculationDate,
  });

  if (
    input.ratePercent !== undefined &&
    input.ratePercent !== resolved.ratePercent
  ) {
    reject(
      `Requested ratePercent ${input.ratePercent} does not match schedule rate ${resolved.ratePercent}`,
      TaxEngineErrorCode.INVALID_TAX_RATE,
      {
        kind: input.kind,
        code,
        calculationDate: input.calculationDate,
        requestedRatePercent: input.ratePercent,
        scheduleRatePercent: resolved.ratePercent,
        scheduleCode: resolved.code,
      },
    );
  }

  if (
    input.taxability !== undefined &&
    input.taxability !== resolved.taxability
  ) {
    reject(
      `Requested taxability ${input.taxability} does not match schedule taxability ${resolved.taxability}`,
      TaxEngineErrorCode.INVALID_INPUT,
      {
        kind: input.kind,
        code,
        calculationDate: input.calculationDate,
        requestedTaxability: input.taxability,
        scheduleTaxability: resolved.taxability,
        scheduleCode: resolved.code,
      },
    );
  }

  return resolved;
}
