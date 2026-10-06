import type { IndiaTaxability } from './types.js';
import type { ResolvedIndiaScheduleEntry } from './schedules/index.js';

export function resolveTaxability(entry: ResolvedIndiaScheduleEntry): IndiaTaxability {
  return entry.taxability;
}

export function carriesGstHeads(taxability: IndiaTaxability): boolean {
  return taxability === 'TAXABLE' || taxability === 'ZERO_RATED';
}
