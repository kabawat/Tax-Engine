import { TaxEngineError, TaxEngineErrorCode } from '../../../errors/TaxEngineError.js';
import type { IndiaItemInput, ResolvedIndiaParty } from '../parties.js';
import { isKnownIndiaState, normalizeIndiaState } from '../states.js';
import { SupplyKind, type SupplyKind as SupplyKindType } from '../types.js';
import {
  DEFAULT_SERVICE_FAMILY_RULES,
  type ServiceFamilyRule,
} from './service-family-rules.js';

export type {
  ServiceFamilyRule,
  ServiceResolveMode,
} from './service-family-rules.js';
export { DEFAULT_SERVICE_FAMILY_RULES } from './service-family-rules.js';

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

export interface PlaceOfSupplyRule {
  readonly id: string;
  readonly kind: SupplyKindType;
  readonly resolve: (ctx: PlaceOfSupplyContext) => PlaceOfSupplyResult | undefined;
}

function posResult(
  state: string,
  kind: SupplyKindType,
  ruleId: string,
): PlaceOfSupplyResult {
  return { state, kind, ruleId };
}

function requireState(state: string, field: string): string {
  const normalized = normalizeIndiaState(state);
  if (!normalized) {
    throw new TaxEngineError('State is required for place of supply', {
      code: TaxEngineErrorCode.INVALID_INPUT,
      details: { field },
    });
  }
  if (!isKnownIndiaState(normalized)) {
    throw new TaxEngineError(
      'Unknown or unsupported India state for place of supply',
      {
        code: TaxEngineErrorCode.INVALID_INPUT,
        details: { field, state: normalized },
      },
    );
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

  const ruleId =
    kind === SupplyKind.GOODS
      ? 'goods.explicit-override'
      : 'services.explicit-override';

  return posResult(
    requireState(ctx.item.placeOfSupplyState, 'item.placeOfSupplyState'),
    kind,
    ruleId,
  );
}

// Longest matching SAC prefix wins
export function matchServiceFamily(
  sac: string,
  families: readonly ServiceFamilyRule[] = DEFAULT_SERVICE_FAMILY_RULES,
): ServiceFamilyRule | undefined {
  const code = sac.trim();
  let best: ServiceFamilyRule | undefined;
  let bestPrefixLength = -1;

  for (const rule of families) {
    for (const prefix of rule.prefixes) {
      if (code.startsWith(prefix) && prefix.length > bestPrefixLength) {
        best = rule;
        bestPrefixLength = prefix.length;
      }
    }
  }

  return best;
}

function resolveServiceFamily(
  ctx: PlaceOfSupplyContext,
  family: ServiceFamilyRule,
): PlaceOfSupplyResult {
  const kind = SupplyKind.SERVICES;

  switch (family.resolve) {
    case 'buyer':
      return posResult(
        requireState(ctx.buyer.state, 'buyer.state'),
        kind,
        family.id,
      );

    case 'seller':
      return posResult(
        requireState(ctx.seller.state, 'seller.state'),
        kind,
        family.id,
      );

    case 'delivery': {
      const delivery = ctx.item.deliveryState?.trim();
      if (!delivery) {
        throw new TaxEngineError(
          `Place of supply for ${family.id} requires item.deliveryState or item.placeOfSupplyState`,
          {
            code: TaxEngineErrorCode.INVALID_INPUT,
            details: { ruleId: family.id, sac: ctx.item.sac },
          },
        );
      }
      return posResult(
        requireState(delivery, 'item.deliveryState'),
        kind,
        family.id,
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

export function createGoodsPlaceOfSupplyRule(): PlaceOfSupplyRule {
  const ruleId = 'goods.recipient-location';

  return {
    id: ruleId,
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
        return posResult(
          requireState(delivery, 'item.deliveryState'),
          SupplyKind.GOODS,
          'goods.delivery-location',
        );
      }

      return posResult(
        requireState(ctx.buyer.state, 'buyer.state'),
        SupplyKind.GOODS,
        ruleId,
      );
    },
  };
}

export function createServicesPlaceOfSupplyRule(
  families: readonly ServiceFamilyRule[] = DEFAULT_SERVICE_FAMILY_RULES,
): PlaceOfSupplyRule {
  const ruleId = 'services.recipient-location';

  return {
    id: ruleId,
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
        const family = matchServiceFamily(sac, families);
        if (family !== undefined) {
          return resolveServiceFamily(ctx, family);
        }
      }

      return posResult(
        requireState(ctx.buyer.state, 'buyer.state'),
        SupplyKind.SERVICES,
        ruleId,
      );
    },
  };
}

export const goodsPlaceOfSupplyRule = createGoodsPlaceOfSupplyRule();
export const servicesPlaceOfSupplyRule = createServicesPlaceOfSupplyRule();

// Deprecated: prefer goodsPlaceOfSupplyRule
export const goodsRecipientRule = goodsPlaceOfSupplyRule;
// Deprecated: prefer servicesPlaceOfSupplyRule
export const servicesRecipientRule = servicesPlaceOfSupplyRule;

export function createDefaultPlaceOfSupplyRules(
  families: readonly ServiceFamilyRule[] = DEFAULT_SERVICE_FAMILY_RULES,
): readonly PlaceOfSupplyRule[] {
  return [
    createGoodsPlaceOfSupplyRule(),
    createServicesPlaceOfSupplyRule(families),
  ];
}

const DEFAULT_RULES = createDefaultPlaceOfSupplyRules();

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
