import { INDIA_FULL_SCHEDULE_INDEX } from './schedules/full.js';
import {
  assertResolvedIndiaRate,
  validateIndiaGstRateWithSchedule,
  type ValidateIndiaGstRateInput,
} from './schedules/validate-rate.js';
import type { ResolvedIndiaScheduleEntry } from './schedules/index.js';

export type { ValidateIndiaGstRateInput };
export { assertResolvedIndiaRate };

// Resolve + validate against schedule (defaults to full bundled index)
export function validateIndiaGstRate(
  input: ValidateIndiaGstRateInput,
): ResolvedIndiaScheduleEntry {
  return validateIndiaGstRateWithSchedule({
    ...input,
    schedule: input.schedule ?? INDIA_FULL_SCHEDULE_INDEX,
  });
}
