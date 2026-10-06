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

type ServiceResolveMode = 'buyer' | 'seller' | 'delivery' | 'require_override';

type ServiceFamilyRule = {
  readonly id: string;
  readonly prefixes: readonly string[];
  readonly resolve: ServiceResolveMode;
};

const SERVICE_FAMILY_RULES: readonly ServiceFamilyRule[] = [
  { id: 'services.immovable-property', prefixes: ['9972', '9954'], resolve: 'require_override' },
  { id: 'services.performance-location', prefixes: ['9965'], resolve: 'seller' },
  { id: 'services.events-location', prefixes: ['9963'], resolve: 'require_override' },
  { id: 'services.goods-transport', prefixes: ['9967'], resolve: 'delivery' },
  { id: 'services.oidar', prefixes: ['998434', '998439'], resolve: 'buyer' },
];

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

function explicitOverride(
  ctx: PlaceOfSupplyContext,
  kind: SupplyKindType,
): PlaceOfSupplyResult | undefined {
  if (!ctx.item.placeOfSupplyState) {
    return undefined;
  }
  return {
    state: requireState(ctx.item.placeOfSupplyState, 'item.placeOfSupplyState'),
    kind,
    ruleId: kind === SupplyKind.GOODS ? 'goods.explicit-override' : 'services.explicit-override',
  };
}

function matchServiceFamily(sac: string): ServiceFamilyRule | undefined {
  const code = sac.trim();
  for (const rule of SERVICE_FAMILY_RULES) {
    if (rule.prefixes.some((prefix) => code.startsWith(prefix))) {
      return rule;
    }
  }
  return undefined;
}

function resolveServiceFamily(
  ctx: PlaceOfSupplyContext,
  family: ServiceFamilyRule,
): PlaceOfSupplyResult {
  switch (family.resolve) {
    case 'buyer':
      return {
        state: requireState(ctx.buyer.state, 'buyer.state'),
        kind: SupplyKind.SERVICES,
        ruleId: family.id,
      };
    case 'seller':
      return {
        state: requireState(ctx.seller.state, 'seller.state'),
        kind: SupplyKind.SERVICES,
        ruleId: family.id,
      };
    case 'delivery': {
      const delivery = ctx.item.deliveryState?.trim();
      if (delivery) {
        return {
          state: requireState(delivery, 'item.deliveryState'),
          kind: SupplyKind.SERVICES,
          ruleId: family.id,
        };
      }
      throw new TaxEngineError(
        `Place of supply for ${family.id} requires item.deliveryState or item.placeOfSupplyState`,
        {
          code: TaxEngineErrorCode.INVALID_INPUT,
          details: { ruleId: family.id, sac: ctx.item.sac },
        },
      );
    }
    case 'require_override':
      throw new TaxEngineError(
        `Place of supply for ${family.id} requires item.placeOfSupplyState`,
        {
          code: TaxEngineErrorCode.INVALID_INPUT,
          details: { ruleId: family.id, sac: ctx.item.sac },
        },
      );
    default: {
      const _exhaustive: never = family.resolve;
      throw new TaxEngineError('Unknown place-of-supply resolve mode', {
        code: TaxEngineErrorCode.UNSUPPORTED_CASE,
        details: { mode: _exhaustive },
      });
    }
  }
}

export const goodsPlaceOfSupplyRule: PlaceOfSupplyRule = {
  id: 'goods.recipient-location',
  kind: SupplyKind.GOODS,
  resolve(ctx) {
    if (ctx.item.type !== 'PRODUCT') {
      return undefined;
    }
    const override = explicitOverride(ctx, SupplyKind.GOODS);
    if (override) {
      return override;
    }
    const delivery = ctx.item.deliveryState?.trim();
    if (delivery) {
      return {
        state: requireState(delivery, 'item.deliveryState'),
        kind: SupplyKind.GOODS,
        ruleId: 'goods.delivery-location',
      };
    }
    return {
      state: requireState(ctx.buyer.state, 'buyer.state'),
      kind: SupplyKind.GOODS,
      ruleId: this.id,
    };
  },
};

export const servicesPlaceOfSupplyRule: PlaceOfSupplyRule = {
  id: 'services.recipient-location',
  kind: SupplyKind.SERVICES,
  resolve(ctx) {
    if (ctx.item.type !== 'SERVICE') {
      return undefined;
    }
    const override = explicitOverride(ctx, SupplyKind.SERVICES);
    if (override) {
      return override;
    }
    const sac = ctx.item.sac?.trim();
    if (sac) {
      const family = matchServiceFamily(sac);
      if (family !== undefined) {
        return resolveServiceFamily(ctx, family);
      }
    }
    return {
      state: requireState(ctx.buyer.state, 'buyer.state'),
      kind: SupplyKind.SERVICES,
      ruleId: this.id,
    };
  },
};

export const goodsRecipientRule = goodsPlaceOfSupplyRule;
export const servicesRecipientRule = servicesPlaceOfSupplyRule;

const DEFAULT_RULES: readonly PlaceOfSupplyRule[] = [
  goodsPlaceOfSupplyRule,
  servicesPlaceOfSupplyRule,
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
