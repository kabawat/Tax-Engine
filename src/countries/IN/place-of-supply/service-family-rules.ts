export type ServiceResolveMode =
  | 'buyer'
  | 'seller'
  | 'delivery'
  | 'require_override';

export interface ServiceFamilyRule {
  readonly id: string;
  // SAC code prefixes; longest match wins
  readonly prefixes: readonly string[];
  readonly resolve: ServiceResolveMode;
}

// Default SAC-family PoS rules (override via TaxConfig.serviceFamilyRules)
export const DEFAULT_SERVICE_FAMILY_RULES: readonly ServiceFamilyRule[] = [
  {
    id: 'services.immovable-property',
    prefixes: ['9972', '9954'],
    resolve: 'require_override',
  },
  {
    id: 'services.performance-location',
    prefixes: ['9965'],
    resolve: 'seller',
  },
  {
    id: 'services.events-location',
    prefixes: ['9963'],
    resolve: 'require_override',
  },
  {
    id: 'services.passenger-transport',
    prefixes: ['9964'],
    resolve: 'require_override',
  },
  {
    id: 'services.goods-transport',
    prefixes: ['9967'],
    resolve: 'delivery',
  },
  {
    id: 'services.oidar',
    prefixes: ['998434', '998439'],
    resolve: 'buyer',
  },
];
