/**
 * Rule validity window using explicit ISO 8601 date strings (YYYY-MM-DD).
 * `effectiveUntil` omitted means the rule is open-ended.
 */
export interface EffectivePeriod {
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
