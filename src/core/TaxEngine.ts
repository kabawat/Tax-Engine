import type { TaxInput } from '../models/tax-input.js';
import type { TaxResult } from '../models/tax-output.js';

export interface TaxEngine {
  calculate(input: TaxInput): TaxResult;
}
