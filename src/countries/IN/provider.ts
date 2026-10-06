import type { CountryTaxCalculator, CountryTaxProvider } from '../../core/country/types.js';
import type { IndiaTaxConfig, IndiaTaxInput } from './parties.js';
import { IndiaGSTEngine } from './engine.js';

export class IndiaTaxProvider implements CountryTaxProvider<IndiaTaxInput> {
  readonly country = 'IN';

  constructor(private readonly config: IndiaTaxConfig = {}) {}

  createCalculator(): CountryTaxCalculator<IndiaTaxInput> {
    return new IndiaGSTEngine(this.config);
  }
}
