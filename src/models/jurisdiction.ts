/**
 * Generic geographic jurisdiction for tax applicability.
 * Country-specific structures are represented through optional fields,
 * not through separate per-country models.
 */
export interface Jurisdiction {
  /** ISO 3166-1 alpha-2 country code (required). */
  readonly country: string;
  readonly state?: string;
  readonly city?: string;
  readonly postalCode?: string;
}
