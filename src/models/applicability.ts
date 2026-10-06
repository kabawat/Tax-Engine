import type { ItemType } from './item.js';

export interface RuleApplicability {
  readonly itemTypes?: readonly ItemType[];
  readonly itemCategories?: readonly string[];
  readonly matchAllCategories?: boolean;
}
