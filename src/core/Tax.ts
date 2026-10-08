import type { CountryTaxCalculator, TaxOutcome } from '../core/country/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import type { DiscountMode } from '../discount/types.js';
import { DiscountMode as DiscountModes } from '../discount/types.js';
import { IndiaTaxProvider } from '../countries/IN/provider.js';
import type {
  IndiaTaxConfig,
  IndiaTaxInput,
  StateCodeSource,
} from '../countries/IN/parties.js';
import type { PlaceOfSupplyRule } from '../countries/IN/place-of-supply/index.js';
import type { ServiceFamilyRule } from '../countries/IN/place-of-supply/service-family-rules.js';
import type {
  IndiaScheduleEntry,
  IndiaScheduleIndex,
} from '../countries/IN/schedules/index.js';
import { UaeTaxProvider } from '../countries/AE/provider.js';
import type { UaeTaxInput } from '../countries/AE/provider.js';
import { UsTaxProvider } from '../countries/US/provider.js';
import type { UsTaxInput } from '../countries/US/provider.js';

export const SupportedCountry = {
  IN: 'IN',
  AE: 'AE',
  US: 'US',
} as const;

export type SupportedCountry =
  (typeof SupportedCountry)[keyof typeof SupportedCountry];

export interface TaxConfig {
  readonly stateCodeSource?: StateCodeSource;
  readonly discountMode?: DiscountMode;
  // India: schedule index (default full; or pickIndiaSchedule subset)
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
  // India: override SAC-family PoS table (ignored when placeOfSupplyRules is set)
  readonly serviceFamilyRules?: readonly ServiceFamilyRule[];
  // India: full PoS rule list override
  readonly placeOfSupplyRules?: readonly PlaceOfSupplyRule[];
}

export type TaxCalculateInput = IndiaTaxInput | UaeTaxInput | UsTaxInput;

function normalizeCountry(country: string): string {
  return country.trim().toUpperCase();
}

function validateConfig(config: TaxConfig): void {
  if (
    config.discountMode !== undefined &&
    config.discountMode !== DiscountModes.BEFORE_TAX &&
    config.discountMode !== DiscountModes.AFTER_TAX
  ) {
    throw new TaxEngineError('discountMode must be BEFORE_TAX or AFTER_TAX', {
      code: TaxEngineErrorCode.INVALID_INPUT,
      details: { field: 'discountMode' },
    });
  }
}

function toIndiaConfig(config: TaxConfig): IndiaTaxConfig {
  const indiaConfig: IndiaTaxConfig = {};

  if (config.stateCodeSource !== undefined) {
    Object.assign(indiaConfig, { stateCodeSource: config.stateCodeSource });
  }
  if (config.discountMode !== undefined) {
    Object.assign(indiaConfig, { discountMode: config.discountMode });
  }
  if (config.schedule !== undefined) {
    Object.assign(indiaConfig, { schedule: config.schedule });
  }
  if (config.serviceFamilyRules !== undefined) {
    Object.assign(indiaConfig, { serviceFamilyRules: config.serviceFamilyRules });
  }
  if (config.placeOfSupplyRules !== undefined) {
    Object.assign(indiaConfig, { placeOfSupplyRules: config.placeOfSupplyRules });
  }

  return indiaConfig;
}

function createCalculator(
  country: SupportedCountry,
  config: TaxConfig,
): CountryTaxCalculator {
  if (country === 'IN') {
    return new IndiaTaxProvider(toIndiaConfig(config)).createCalculator();
  }

  const discountOnly =
    config.discountMode !== undefined
      ? { discountMode: config.discountMode }
      : {};

  if (country === 'AE') {
    return new UaeTaxProvider(discountOnly).createCalculator();
  }

  return new UsTaxProvider(discountOnly).createCalculator();
}

export class Tax {
  declare readonly country: SupportedCountry;
  private readonly calculator: CountryTaxCalculator;
  private readonly config: Readonly<TaxConfig>;

  constructor(country: string, config: TaxConfig = {}) {
    validateConfig(config);

    const code = normalizeCountry(country);
    if (code !== 'IN' && code !== 'AE' && code !== 'US') {
      throw new TaxEngineError(`Unsupported country: ${country}`, {
        code: TaxEngineErrorCode.INVALID_COUNTRY,
        details: { country, supported: ['IN', 'AE', 'US'] },
      });
    }

    Object.defineProperty(this, 'country', {
      value: code,
      writable: false,
      enumerable: true,
      configurable: false,
    });

    this.config = Object.freeze({ ...config });
    this.calculator = createCalculator(code, config);
  }

  calculate(input: TaxCalculateInput): TaxOutcome {
    return this.calculator.calculate(input);
  }
}

export default Tax;
