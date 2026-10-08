import { TaxEngineError, TaxEngineErrorCode } from '../../errors/TaxEngineError.js';
import { getStateFromGSTIN, hasGstin, validateGSTIN } from './gstin.js';
import type {
  IndiaParty,
  ResolvedIndiaParty,
  StateCodeSource,
} from './parties.js';
import { StateCodeSource as Source } from './parties.js';
import { normalizeIndiaState } from './states.js';

function reject(message: string, details?: unknown): never {
  throw new TaxEngineError(message, {
    code: TaxEngineErrorCode.INVALID_INPUT,
    details,
  });
}

function withOptionalFields(
  base: {
    state: string;
    gstRegistered: boolean;
    stateSource: StateCodeSource;
    gstin?: string;
  },
  party: IndiaParty,
): ResolvedIndiaParty {
  const resolved: ResolvedIndiaParty = {
    state: base.state,
    gstRegistered: base.gstRegistered,
    stateSource: base.stateSource,
  };
  if (base.gstin !== undefined) {
    Object.assign(resolved, { gstin: base.gstin });
  }
  if (party.taxpayerType !== undefined) {
    Object.assign(resolved, { taxpayerType: party.taxpayerType });
  }
  if (party.customerType !== undefined) {
    Object.assign(resolved, { customerType: party.customerType });
  }
  return resolved;
}

export function resolveIndiaParty(
  party: IndiaParty,
  role: 'seller' | 'buyer',
  stateCodeSource: StateCodeSource,
): ResolvedIndiaParty {
  const providedState =
    party.state !== undefined && party.state.trim() !== ''
      ? normalizeIndiaState(party.state)
      : undefined;
  const gstinPresent = hasGstin(party.gstin);

  if (stateCodeSource === Source.GSTIN) {
    if (gstinPresent) {
      const gstin = validateGSTIN(party.gstin!);
      const gstinState = getStateFromGSTIN(gstin);
      if (providedState !== undefined && providedState !== gstinState) {
        reject('GSTIN state does not match provided state', {
          field: role,
          gstinState,
          providedState,
        });
      }
      return withOptionalFields(
        {
          state: gstinState,
          gstRegistered: true,
          stateSource: Source.GSTIN,
          gstin,
        },
        party,
      );
    }

    if (providedState === undefined) {
      reject(`${role} requires gstin or state when stateCodeSource is GSTIN`, {
        field: role,
      });
    }

    return withOptionalFields(
      {
        state: providedState,
        gstRegistered: false,
        stateSource: Source.STATE,
      },
      party,
    );
  }

  if (providedState === undefined) {
    reject(`${role}.state is required when stateCodeSource is STATE`, {
      field: `${role}.state`,
    });
  }

  if (gstinPresent) {
    const gstin = validateGSTIN(party.gstin!);
    const gstinState = getStateFromGSTIN(gstin);
    if (gstinState !== providedState) {
      reject('GSTIN state does not match provided state', {
        field: role,
        gstinState,
        providedState,
      });
    }
    return withOptionalFields(
      {
        state: providedState,
        gstRegistered: true,
        stateSource: Source.STATE,
        gstin,
      },
      party,
    );
  }

  return withOptionalFields(
    {
      state: providedState,
      gstRegistered: false,
      stateSource: Source.STATE,
    },
    party,
  );
}
