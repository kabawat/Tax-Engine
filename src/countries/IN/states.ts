// UTs using UTGST (DL/PY use SGST)
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
  '01': 'JK', // Jammu & Kashmir
  '02': 'HP', // Himachal Pradesh
  '03': 'PB', // Punjab
  '04': 'CH', // Chandigarh
  '05': 'UK', // Uttarakhand
  '06': 'HR', // Haryana
  '07': 'DL', // Delhi
  '08': 'RJ', // Rajasthan
  '09': 'UP', // Uttar Pradesh
  '10': 'BR', // Bihar
  '11': 'SK', // Sikkim
  '12': 'AR', // Arunachal Pradesh
  '13': 'NL', // Nagaland
  '14': 'MN', // Manipur
  '15': 'MZ', // Mizoram
  '16': 'TR', // Tripura
  '17': 'ML', // Meghalaya
  '18': 'AS', // Assam
  '19': 'WB', // West Bengal
  '20': 'JH', // Jharkhand
  '21': 'OD', // Odisha
  '22': 'CG', // Chhattisgarh
  '23': 'MP', // Madhya Pradesh
  '24': 'GJ', // Gujarat
  '25': 'DH', // Dadra & Nagar Haveli and Daman & Diu (legacy)
  '26': 'DH', // Dadra & Nagar Haveli and Daman & Diu
  '27': 'MH', // Maharashtra
  '28': 'AP', // Andhra Pradesh (legacy)
  '29': 'KA', // Karnataka
  '30': 'GA', // Goa
  '31': 'LD', // Lakshadweep
  '32': 'KL', // Kerala
  '33': 'TN', // Tamil Nadu
  '34': 'PY', // Puducherry
  '35': 'AN', // Andaman & Nicobar Islands
  '36': 'TS', // Telangana
  '37': 'AP', // Andhra Pradesh
  '38': 'LA', // Ladakh
  '97': 'OTH', // Other Territory
  '99': 'OTH', // Centre Jurisdiction
};

export function stateFromGstin(gstin: string): string | undefined {
  const code = gstin.slice(0, 2);
  return GSTIN_STATE_CODES[code];
}
