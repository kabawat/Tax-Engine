import { IndiaTaxability, type IndiaTaxability as IndiaTaxabilityType } from './types.js';
import type { ResolvedIndiaScheduleEntry } from './schedules/index.js';

export function resolveTaxability(entry: ResolvedIndiaScheduleEntry): IndiaTaxabilityType {
  return entry.taxability;
}

// TAXABLE and ZERO_RATED may participate in head/charge paths; NIL/EXEMPT/NON_GST do not
export function carriesGstHeads(taxability: IndiaTaxabilityType): boolean {
  return (
    taxability === IndiaTaxability.TAXABLE ||
    taxability === IndiaTaxability.ZERO_RATED
  );
}

// Schedule classifications that never emit GST/cess heads (taxes always [])
export function isNilExemptOrNonGst(taxability: IndiaTaxabilityType): boolean {
  return (
    taxability === IndiaTaxability.EXEMPT ||
    taxability === IndiaTaxability.NIL_RATED ||
    taxability === IndiaTaxability.NON_GST
  );
}
