export { Tax, SupportedCountry, type TaxConfig, type TaxCalculateInput } from './core/Tax.js';
export { default } from './core/Tax.js';

export type {
  CountryTaxProvider,
  CountryTaxCalculator,
  CountryTaxLine,
  TaxOutcome,
} from './core/country/types.js';
export { ChargeMode, LiabilityParty } from './core/country/types.js';
export type { ChargeMode as ChargeModeType, LiabilityParty as LiabilityPartyType } from './core/country/types.js';

export type {
  IndiaTaxInput,
  IndiaParty,
  IndiaItemInput,
  IndiaTaxConfig,
  ResolvedIndiaParty,
  StateCodeSource,
} from './countries/IN/parties.js';
export { StateCodeSource as StateCodeSources } from './countries/IN/parties.js';
export {
  IndiaTaxHead,
  IndiaTaxability,
  IndiaTaxpayerType,
  IndiaCustomerType,
  SupplyKind,
} from './countries/IN/types.js';
export {
  carriesGstHeads,
  isNilExemptOrNonGst,
  resolveTaxability,
} from './countries/IN/taxability.js';
export { selectIndiaTaxHeads, withIndiaCessHead } from './countries/IN/tax-heads.js';
export { resolveStateCodeFromGSTIN } from './countries/IN/gstin.js';
export type { UaeTaxInput } from './countries/AE/provider.js';
export type { UsTaxInput } from './countries/US/provider.js';

export {
  DiscountMode,
  DiscountType,
  resolveDiscountMode,
  type DiscountInput,
  type AppliedDiscount,
} from './discount/index.js';

/** @deprecated Prefer `new Tax("IN")` */
export type { TaxEngine } from './core/TaxEngine.js';
/** @deprecated Prefer `new Tax(country)` */
export { DefaultTaxEngine, type DefaultTaxEngineOptions } from './core/default-tax-engine.js';

/** @deprecated Prefer `new Tax(country)` */
export type { TaxRuleRegistry } from './registry/TaxRuleRegistry.js';
/** @deprecated Prefer `new Tax(country)` for normal usage */
export { InMemoryTaxRuleRegistry } from './registry/in-memory-tax-rule.registry.js';

export type { TaxInput } from './models/tax-input.js';
export type { TaxResult, TaxLineItem } from './models/tax-output.js';
export {
  TaxRateBasis,
  type TaxRule,
  type TaxRate,
  type CompoundBehavior,
  type TaxableBaseConfig,
  type RuleExemptionConfig,
} from './models/tax-rule.js';
export type { RuleApplicability } from './models/applicability.js';
export type { Jurisdiction } from './models/jurisdiction.js';
export {
  RoundingMode,
  type Money,
  type MoneyAmount,
  type MoneyScale,
  type MoneyConfig,
  type CurrencyCode,
} from './models/money.js';
export { ItemType, type TaxItem } from './models/item.js';
export { PricingMode } from './models/pricing-mode.js';
export { KnownTaxType, type TaxType } from './models/tax-type.js';
export type { TaxCategory } from './models/tax-category.js';
export type { EffectivePeriod } from './models/effective-period.js';
export type { Exemption } from './models/exemption.js';

export {
  TaxEngineError,
  TaxEngineErrorCode,
  type TaxEngineErrorOptions,
} from './errors/TaxEngineError.js';

export type {
  ValidationIssue,
  ValidationResult,
  TaxInputValidator,
} from './validators/input.validator.js';
export type { TaxRuleValidator } from './validators/rule.validator.js';
export { DefaultTaxRuleValidator } from './validators/default-tax-rule.validator.js';
export { validateTaxRule } from './validators/validate-tax-rule.js';
export { validateTaxRules } from './validators/validate-tax-rules.js';
export { validateTaxInput } from './validators/validate-tax-input.js';
