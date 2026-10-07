export { IndiaTaxProvider } from './provider.js';
export { IndiaGSTEngine } from './engine.js';
export { StateCodeSource as StateCodeSources } from './parties.js';
export { resolveIndiaParty } from './party-resolution.js';
export { resolveStateCodeFromGSTIN } from './gstin.js';
export { selectIndiaTaxHeads, withIndiaCessHead } from './tax-heads.js';
export {
  carriesGstHeads,
  isNilExemptOrNonGst,
  resolveTaxability,
} from './taxability.js';

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
  assertRateHistoryIntegrity,
  scheduleLookupCandidates,
  resolveScheduleEntry,
  hsnLookupCandidates,
  sacLookupCandidates,
  buildScheduleIndex,
  scheduleLookupKey,
  pickIndiaSchedule,
  type IndiaScheduleEntry,
  type IndiaScheduleIndex,
  type PickIndiaScheduleCodes,
  type IndiaScheduleRatePeriod,
  type ResolvedIndiaScheduleEntry,
} from './schedules/index.js';

export {
  validateIndiaGstRate,
  assertResolvedIndiaRate,
  type ValidateIndiaGstRateInput,
} from './validate-gst-rate.js';

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
