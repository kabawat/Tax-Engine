// Validity window (ISO dates; omit effectiveUntil for open-ended)
export interface EffectivePeriod {
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
