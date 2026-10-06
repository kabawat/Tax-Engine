import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';
import type { IndiaItemInput, ResolvedIndiaParty } from '../parties.js';
import { normalizeIndiaState } from '../states.js';
import { SupplyKind, type SupplyKind as SupplyKindType } from '../types.js';

export interface PlaceOfSupplyResult {
  readonly state: string;
  readonly kind: SupplyKindType;
  readonly ruleId: string;
}

export interface PlaceOfSupplyContext {
  readonly seller: ResolvedIndiaParty;
  readonly buyer: ResolvedIndiaParty;
  readonly item: IndiaItemInput;
}

export type PlaceOfSupplyRule = {
  readonly id: string;
  readonly kind: SupplyKindType;
  readonly resolve: (ctx: PlaceOfSupplyContext) => PlaceOfSupplyResult | undefined;
};

function requireState(state: string, field: string): string {
  const normalized = normalizeIndiaState(state);
  if (!normalized) {
    throw new TaxEngineError('State is required for place of supply', {
      code: TaxEngineErrorCode.INVALID_INPUT,
      details: { field },
    });
  }
  return normalized;
}

// Goods PoS = buyer state
export const goodsRecipientRule: PlaceOfSupplyRule = {
  id: 'goods.recipient-location',
  kind: SupplyKind.GOODS,
  resolve(ctx) {
    if (ctx.item.type !== 'PRODUCT') {
      return undefined;
    }
    if (ctx.item.placeOfSupplyState) {
      return {
        state: requireState(ctx.item.placeOfSupplyState, 'item.placeOfSupplyState'),
        kind: SupplyKind.GOODS,
        ruleId: 'goods.explicit-override',
      };
    }
    return {
      state: requireState(ctx.buyer.state, 'buyer.state'),
      kind: SupplyKind.GOODS,
      ruleId: this.id,
    };
  },
};

// Services PoS = buyer state
export const servicesRecipientRule: PlaceOfSupplyRule = {
  id: 'services.recipient-location',
  kind: SupplyKind.SERVICES,
  resolve(ctx) {
    if (ctx.item.type !== 'SERVICE') {
      return undefined;
    }
    if (ctx.item.placeOfSupplyState) {
      return {
        state: requireState(ctx.item.placeOfSupplyState, 'item.placeOfSupplyState'),
        kind: SupplyKind.SERVICES,
        ruleId: 'services.explicit-override',
      };
    }
    return {
      state: requireState(ctx.buyer.state, 'buyer.state'),
      kind: SupplyKind.SERVICES,
      ruleId: this.id,
    };
  },
};

// SAC 996511 → PoS = seller state
export const servicesPerformanceLocationSampleRule: PlaceOfSupplyRule = {
  id: 'services.performance-location.sample-996511',
  kind: SupplyKind.SERVICES,
  resolve(ctx) {
    if (ctx.item.type !== 'SERVICE') {
      return undefined;
    }
    if (ctx.item.sac !== '996511') {
      return undefined;
    }
    if (ctx.item.placeOfSupplyState) {
      return {
        state: requireState(ctx.item.placeOfSupplyState, 'item.placeOfSupplyState'),
        kind: SupplyKind.SERVICES,
        ruleId: 'services.explicit-override',
      };
    }
    return {
      state: requireState(ctx.seller.state, 'seller.state'),
      kind: SupplyKind.SERVICES,
      ruleId: this.id,
    };
  },
};

const DEFAULT_RULES: readonly PlaceOfSupplyRule[] = [
  servicesPerformanceLocationSampleRule,
  goodsRecipientRule,
  servicesRecipientRule,
];

export function resolvePlaceOfSupply(
  ctx: PlaceOfSupplyContext,
  rules: readonly PlaceOfSupplyRule[] = DEFAULT_RULES,
): PlaceOfSupplyResult {
  for (const rule of rules) {
    const result = rule.resolve(ctx);
    if (result !== undefined) {
      return result;
    }
  }
  throw new TaxEngineError('No place-of-supply rule matched the supply', {
    code: TaxEngineErrorCode.UNSUPPORTED_CASE,
    details: { itemType: ctx.item.type },
  });
}
