/** Generic tax exemption claim supplied on tax input. */
export interface Exemption {
  readonly id: string;
  readonly code?: string;
  readonly name?: string;
  readonly description?: string;
  readonly applicableCategories?: readonly string[];
  readonly conditions?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
