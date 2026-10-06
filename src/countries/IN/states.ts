/** UTs that use UTGST (not SGST). DL/PY use SGST. */
export const INDIA_UTGST_STATES = new Set<string>([
  'AN',
  'CH',
  'DH',
  'LD',
  'LA',
]);

export function normalizeIndiaState(state: string): string {
  return state.trim().toUpperCase();
}

export function isUnionTerritoryWithUtgst(state: string): boolean {
  return INDIA_UTGST_STATES.has(normalizeIndiaState(state));
}

export const GSTIN_STATE_CODES: Readonly<Record<string, string>> = {
  '01': 'JK',
  '02': 'HP',
  '03': 'PB',
  '04': 'CH',
  '05': 'UK',
  '06': 'HR',
  '07': 'DL',
  '08': 'RJ',
  '09': 'UP',
  '10': 'BR',
  '11': 'SK',
  '12': 'AR',
  '13': 'NL',
  '14': 'MN',
  '15': 'MZ',
  '16': 'TR',
  '17': 'ML',
  '18': 'AS',
  '19': 'WB',
  '20': 'JH',
  '21': 'OD',
  '22': 'CG',
  '23': 'MP',
  '24': 'GJ',
  '26': 'DH',
  '27': 'MH',
  '29': 'KA',
  '30': 'GA',
  '32': 'KL',
  '33': 'TN',
  '34': 'PY',
  '35': 'AN',
  '36': 'TS',
  '37': 'AP',
  '38': 'LD',
  '97': 'OTH',
};

export function stateFromGstin(gstin: string): string | undefined {
  const code = gstin.slice(0, 2);
  return GSTIN_STATE_CODES[code];
}
