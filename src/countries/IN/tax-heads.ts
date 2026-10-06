import { IndiaTaxHead, type IndiaTaxHead as IndiaTaxHeadType } from './types.js';
import { isUnionTerritoryWithUtgst, normalizeIndiaState } from './states.js';

export interface TaxHeadSpec {
  readonly type: IndiaTaxHeadType;
  readonly ratePercent: number;
}

export function selectIndiaTaxHeads(options: {
  readonly supplierState: string;
  readonly placeOfSupplyState: string;
  readonly totalRatePercent: number;
}): readonly TaxHeadSpec[] {
  const supplier = normalizeIndiaState(options.supplierState);
  const pos = normalizeIndiaState(options.placeOfSupplyState);
  const total = options.totalRatePercent;

  if (total < 0 || !Number.isFinite(total)) {
    return [];
  }

  if (supplier === pos) {
    const half = total / 2;
    const localHead = isUnionTerritoryWithUtgst(pos)
      ? IndiaTaxHead.UTGST
      : IndiaTaxHead.SGST;
    return [
      { type: IndiaTaxHead.CGST, ratePercent: half },
      { type: localHead, ratePercent: half },
    ];
  }

  return [{ type: IndiaTaxHead.IGST, ratePercent: total }];
}
