export interface IndiaExcludedChapter {
  readonly chapter: string;
  readonly reason: string;
}

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
  readonly sacHeadings?: readonly string[];
  readonly excludedChapters?: readonly IndiaExcludedChapter[];
}
