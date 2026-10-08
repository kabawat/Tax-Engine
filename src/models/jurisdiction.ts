export interface Jurisdiction {
  // ISO 3166-1 alpha-2
  readonly country: string;
  readonly state?: string;
  readonly city?: string;
  readonly postalCode?: string;
}
