import { ChargeMode, LiabilityParty } from '../../core/country/types.js';
import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import type { ResolvedIndiaScheduleEntry } from './schedules/index.js';
import type { ResolvedIndiaParty } from './parties.js';
import { IndiaTaxpayerType } from './types.js';

export interface ChargeDecision {
  readonly chargeMode: ChargeMode;
  readonly liabilityParty: typeof LiabilityParty[keyof typeof LiabilityParty];
  readonly levyTax: boolean;
}

export function resolveChargeMode(options: {
  readonly seller: ResolvedIndiaParty;
  readonly buyer: ResolvedIndiaParty;
  readonly schedule: ResolvedIndiaScheduleEntry;
}): ChargeDecision {
  const { seller, buyer, schedule } = options;

  if (seller.taxpayerType === IndiaTaxpayerType.COMPOSITION) {
    throw new TaxEngineError('Composition scheme supplies are not supported yet', {
      code: TaxEngineErrorCode.UNSUPPORTED_CASE,
      details: { taxpayerType: seller.taxpayerType },
    });
  }

  if (buyer.customerType === 'SEZ') {
    throw new TaxEngineError('SEZ supplies are not supported yet', {
      code: TaxEngineErrorCode.UNSUPPORTED_CASE,
      details: { customerType: buyer.customerType },
    });
  }

  if (schedule.reverseCharge === true) {
    if (!buyer.gstRegistered) {
      throw new TaxEngineError(
        'Reverse charge schedule entry requires a registered recipient',
        {
          code: TaxEngineErrorCode.UNSUPPORTED_CASE,
          details: { code: schedule.code },
        },
      );
    }
    return {
      chargeMode: ChargeMode.REVERSE_CHARGE,
      liabilityParty: LiabilityParty.BUYER,
      levyTax: true,
    };
  }

  if (!seller.gstRegistered) {
    return {
      chargeMode: ChargeMode.FORWARD_CHARGE,
      liabilityParty: LiabilityParty.NONE,
      levyTax: false,
    };
  }

  return {
    chargeMode: ChargeMode.FORWARD_CHARGE,
    liabilityParty: LiabilityParty.SELLER,
    levyTax: true,
  };
}
