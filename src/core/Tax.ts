import type { CountryTaxCalculator, TaxOutcome } from '../core/country/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../errors/TaxEngineError.js';
import { IndiaTaxProvider } from '../countries/IN/provider.js';
import type { IndiaTaxConfig, IndiaTaxInput } from '../countries/IN/parties.js';
import { UaeTaxProvider } from '../countries/AE/provider.js';
import type { UaeTaxInput } from '../countries/AE/provider.js';
import { UsTaxProvider } from '../countries/US/provider.js';
import type { UsTaxInput } from '../countries/US/provider.js';
import type { DiscountMode } from '../discount/types.js';
import { DiscountMode as DiscountModes } from '../discount/types.js';
import type { StateCodeSource } from '../countries/IN/parties.js';
import type {
  IndiaScheduleEntry,
  IndiaScheduleIndex,
} from '../countries/IN/schedules/index.js';

export const SupportedCountry = {
  IN: 'IN',
  AE: 'AE',
  US: 'US',
} as const;

export type SupportedCountry = (typeof SupportedCountry)[keyof typeof SupportedCountry];

export interface TaxConfig {
  readonly stateCodeSource?: StateCodeSource;
  readonly discountMode?: DiscountMode;
  /** India only: custom/full HSN·SAC schedule index (opt-in full via `tax-engine/in/schedule`). */
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
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

    const indiaConfig: IndiaTaxConfig = {
      ...(config.stateCodeSource !== undefined
        ? { stateCodeSource: config.stateCodeSource }
        : {}),
      ...(config.discountMode !== undefined ? { discountMode: config.discountMode } : {}),
      ...(config.schedule !== undefined ? { schedule: config.schedule } : {}),
    };

    if (code === 'IN') {
      this.calculator = new IndiaTaxProvider(indiaConfig).createCalculator();
    } else if (code === 'AE') {
      this.calculator = new UaeTaxProvider({
        ...(config.discountMode !== undefined
          ? { discountMode: config.discountMode }
          : {}),
      }).createCalculator();
    } else {
      this.calculator = new UsTaxProvider({
        ...(config.discountMode !== undefined
          ? { discountMode: config.discountMode }
          : {}),
      }).createCalculator();
    }
  }

  calculate(input: TaxCalculateInput): TaxOutcome {
    return this.calculator.calculate(input);
  }
}

export default Tax;
