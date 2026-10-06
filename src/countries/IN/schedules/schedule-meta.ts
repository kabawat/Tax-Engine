export interface IndiaFullScheduleMeta {
  readonly source: string;
  readonly license: string;
  readonly attribution: string;
  readonly effectiveFrom: string;
  readonly generatedAt: string;
  readonly hsnCount: number;
  readonly sacCount: number;
  readonly hsnSkippedNoRate: number;
  readonly sacDefaultRatePercent: number;
  readonly chapters?: readonly string[];
}
