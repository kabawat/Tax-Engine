import type { Money } from '../../models/money.js';
import type { PricingMode } from '../../models/pricing-mode.js';
import type { DiscountInput, DiscountMode } from '../../discount/types.js';
import type { IndiaScheduleEntry, IndiaScheduleIndex } from './schedules/index.js';
import type { IndiaCustomerType, IndiaTaxpayerType } from './types.js';

export const StateCodeSource = {
  GSTIN: 'GSTIN',
  STATE: 'STATE',
} as const;

export type StateCodeSource = (typeof StateCodeSource)[keyof typeof StateCodeSource];

export interface IndiaTaxConfig {
  readonly stateCodeSource?: StateCodeSource;
  readonly discountMode?: DiscountMode;
  // HSN/SAC schedule (defaults to full)
  readonly schedule?: IndiaScheduleIndex | readonly IndiaScheduleEntry[];
}

export interface IndiaParty {
  readonly state?: string;
  readonly gstin?: string;
  readonly taxpayerType?: IndiaTaxpayerType;
  readonly customerType?: IndiaCustomerType;
}

export interface ResolvedIndiaParty {
  readonly state: string;
  readonly gstRegistered: boolean;
  readonly stateSource: StateCodeSource;
  readonly gstin?: string;
  readonly taxpayerType?: IndiaTaxpayerType;
  readonly customerType?: IndiaCustomerType;
}

export interface IndiaItemInput {
  readonly type: 'PRODUCT' | 'SERVICE';
  readonly hsn?: string;
  readonly sac?: string;
  readonly amount: Money;
  readonly quantity: number;
  readonly pricingMode: PricingMode;
  readonly discount?: DiscountInput;
  readonly placeOfSupplyState?: string;
  readonly deliveryState?: string;
}

export interface IndiaTaxInput {
  readonly seller: IndiaParty;
  readonly buyer: IndiaParty;
  readonly items: readonly IndiaItemInput[];
  readonly calculationDate: string;
  readonly documentType?: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'ADVANCE';
}
