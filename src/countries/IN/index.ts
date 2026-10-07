export { IndiaTaxProvider } from './provider.js';
export { IndiaGSTEngine } from './engine.js';
export { StateCodeSource as StateCodeSources } from './parties.js';
export { resolveIndiaParty } from './party-resolution.js';
export { resolveStateCodeFromGSTIN } from './gstin.js';
export { selectIndiaTaxHeads } from './tax-heads.js';

export type {
  IndiaTaxInput,
  IndiaParty,
  IndiaItemInput,
  IndiaTaxConfig,
  ResolvedIndiaParty,
  StateCodeSource,
} from './parties.js';

export {
  IndiaTaxHead,
  IndiaTaxability,
  IndiaTaxpayerType,
  IndiaCustomerType,
  SupplyKind,
} from './types.js';

export {
  buildScheduleIndex,
  resolveScheduleEntry,
  scheduleLookupKey,
  hsnLookupCandidates,
  sacLookupCandidates,
  scheduleLookupCandidates,
  pickIndiaSchedule,
  assertRateHistoryIntegrity,
  type PickIndiaScheduleCodes,
  type IndiaScheduleEntry,
  type IndiaScheduleIndex,
  type IndiaScheduleRatePeriod,
  type ResolvedIndiaScheduleEntry,
} from './schedules/index.js';

export {
  resolvePlaceOfSupply,
  matchServiceFamily,
  createDefaultPlaceOfSupplyRules,
  createGoodsPlaceOfSupplyRule,
  createServicesPlaceOfSupplyRule,
  DEFAULT_SERVICE_FAMILY_RULES,
  type PlaceOfSupplyRule,
  type PlaceOfSupplyResult,
  type PlaceOfSupplyContext,
  type ServiceFamilyRule,
  type ServiceResolveMode,
} from './place-of-supply/index.js';

export {
  INDIA_UTGST_STATES,
  INDIA_PLACE_OF_SUPPLY_STATES,
  isUnionTerritoryWithUtgst,
  isKnownIndiaState,
} from './states.js';
