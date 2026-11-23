export interface GeoCountryCatalogEntry {
  alpha2: string;
  alpha3: string;
  isoNumeric: string;
  name: string;
  latitude: number;
  longitude: number;
  defaultLanguage: string;
}

export interface GeoStateCatalogEntry {
  code: string;
  fips: string;
  name: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface GeoCityReferenceEntry {
  name: string;
  countryCode: string;
  stateRegion: string;
  latitude: number;
  longitude: number;
}

export const GEO_COUNTRY_CATALOG: readonly GeoCountryCatalogEntry[] = [
  { alpha2: 'US', alpha3: 'USA', isoNumeric: '840', name: 'United States', latitude: 39.8, longitude: -98.5, defaultLanguage: 'en' },
  { alpha2: 'GB', alpha3: 'GBR', isoNumeric: '826', name: 'United Kingdom', latitude: 54.0, longitude: -2.0, defaultLanguage: 'en' },
  { alpha2: 'CA', alpha3: 'CAN', isoNumeric: '124', name: 'Canada', latitude: 56.1, longitude: -106.3, defaultLanguage: 'en' },
  { alpha2: 'AU', alpha3: 'AUS', isoNumeric: '036', name: 'Australia', latitude: -25.2, longitude: 133.7, defaultLanguage: 'en' },
  { alpha2: 'DE', alpha3: 'DEU', isoNumeric: '276', name: 'Germany', latitude: 51.1, longitude: 10.4, defaultLanguage: 'de' },
  { alpha2: 'FR', alpha3: 'FRA', isoNumeric: '250', name: 'France', latitude: 46.2, longitude: 2.2, defaultLanguage: 'fr' },
  { alpha2: 'IN', alpha3: 'IND', isoNumeric: '356', name: 'India', latitude: 20.5, longitude: 78.9, defaultLanguage: 'en' },
  { alpha2: 'NL', alpha3: 'NLD', isoNumeric: '528', name: 'Netherlands', latitude: 52.1, longitude: 5.2, defaultLanguage: 'nl' },
  { alpha2: 'ES', alpha3: 'ESP', isoNumeric: '724', name: 'Spain', latitude: 40.4, longitude: -3.7, defaultLanguage: 'es' },
  { alpha2: 'IT', alpha3: 'ITA', isoNumeric: '380', name: 'Italy', latitude: 41.8, longitude: 12.5, defaultLanguage: 'it' },
  { alpha2: 'BR', alpha3: 'BRA', isoNumeric: '076', name: 'Brazil', latitude: -14.2, longitude: -51.9, defaultLanguage: 'pt' },
  { alpha2: 'MX', alpha3: 'MEX', isoNumeric: '484', name: 'Mexico', latitude: 23.6, longitude: -102.5, defaultLanguage: 'es' },
  { alpha2: 'JP', alpha3: 'JPN', isoNumeric: '392', name: 'Japan', latitude: 36.2, longitude: 138.2, defaultLanguage: 'ja' },
  { alpha2: 'SG', alpha3: 'SGP', isoNumeric: '702', name: 'Singapore', latitude: 1.35, longitude: 103.8, defaultLanguage: 'en' },
  { alpha2: 'AE', alpha3: 'ARE', isoNumeric: '784', name: 'United Arab Emirates', latitude: 23.4, longitude: 53.8, defaultLanguage: 'en' },
  { alpha2: 'IE', alpha3: 'IRL', isoNumeric: '372', name: 'Ireland', latitude: 53.1, longitude: -7.6, defaultLanguage: 'en' },
  { alpha2: 'SE', alpha3: 'SWE', isoNumeric: '752', name: 'Sweden', latitude: 60.1, longitude: 18.6, defaultLanguage: 'sv' },
  { alpha2: 'CH', alpha3: 'CHE', isoNumeric: '756', name: 'Switzerland', latitude: 46.8, longitude: 8.2, defaultLanguage: 'de' },
  { alpha2: 'PL', alpha3: 'POL', isoNumeric: '616', name: 'Poland', latitude: 51.9, longitude: 19.1, defaultLanguage: 'pl' },
  { alpha2: 'NZ', alpha3: 'NZL', isoNumeric: '554', name: 'New Zealand', latitude: -40.9, longitude: 174.8, defaultLanguage: 'en' },
  { alpha2: 'ZA', alpha3: 'ZAF', isoNumeric: '710', name: 'South Africa', latitude: -30.5, longitude: 22.9, defaultLanguage: 'en' },
  { alpha2: 'KR', alpha3: 'KOR', isoNumeric: '410', name: 'South Korea', latitude: 35.9, longitude: 127.7, defaultLanguage: 'ko' },
  { alpha2: 'ID', alpha3: 'IDN', isoNumeric: '360', name: 'Indonesia', latitude: -0.78, longitude: 113.9, defaultLanguage: 'id' },
  { alpha2: 'TR', alpha3: 'TUR', isoNumeric: '792', name: 'Turkey', latitude: 38.9, longitude: 35.2, defaultLanguage: 'tr' },
  { alpha2: 'NO', alpha3: 'NOR', isoNumeric: '578', name: 'Norway', latitude: 60.4, longitude: 8.4, defaultLanguage: 'no' },
  { alpha2: 'DK', alpha3: 'DNK', isoNumeric: '208', name: 'Denmark', latitude: 56.2, longitude: 9.5, defaultLanguage: 'da' },
  { alpha2: 'FI', alpha3: 'FIN', isoNumeric: '246', name: 'Finland', latitude: 61.9, longitude: 25.7, defaultLanguage: 'fi' },
  { alpha2: 'BE', alpha3: 'BEL', isoNumeric: '056', name: 'Belgium', latitude: 50.5, longitude: 4.4, defaultLanguage: 'nl' },
  { alpha2: 'AT', alpha3: 'AUT', isoNumeric: '040', name: 'Austria', latitude: 47.5, longitude: 14.5, defaultLanguage: 'de' },
  { alpha2: 'PT', alpha3: 'PRT', isoNumeric: '620', name: 'Portugal', latitude: 39.3, longitude: -8.2, defaultLanguage: 'pt' },
  { alpha2: 'IL', alpha3: 'ISR', isoNumeric: '376', name: 'Israel', latitude: 31.0, longitude: 34.8, defaultLanguage: 'he' },
  { alpha2: 'AR', alpha3: 'ARG', isoNumeric: '032', name: 'Argentina', latitude: -38.4, longitude: -63.6, defaultLanguage: 'es' },
  { alpha2: 'CL', alpha3: 'CHL', isoNumeric: '152', name: 'Chile', latitude: -35.6, longitude: -71.5, defaultLanguage: 'es' },
  { alpha2: 'CO', alpha3: 'COL', isoNumeric: '170', name: 'Colombia', latitude: 4.5, longitude: -74.2, defaultLanguage: 'es' },
  { alpha2: 'SA', alpha3: 'SAU', isoNumeric: '682', name: 'Saudi Arabia', latitude: 23.8, longitude: 45.0, defaultLanguage: 'ar' },
  { alpha2: 'MY', alpha3: 'MYS', isoNumeric: '458', name: 'Malaysia', latitude: 4.2, longitude: 101.9, defaultLanguage: 'ms' },
  { alpha2: 'PH', alpha3: 'PHL', isoNumeric: '608', name: 'Philippines', latitude: 12.8, longitude: 121.7, defaultLanguage: 'en' },
  { alpha2: 'TH', alpha3: 'THA', isoNumeric: '764', name: 'Thailand', latitude: 15.8, longitude: 100.9, defaultLanguage: 'th' },
  { alpha2: 'VN', alpha3: 'VNM', isoNumeric: '704', name: 'Vietnam', latitude: 14.0, longitude: 108.2, defaultLanguage: 'vi' },
];

export const US_STATE_CATALOG: readonly GeoStateCatalogEntry[] = [
  { code: 'AL', fips: '01', name: 'Alabama', countryCode: 'US', latitude: 32.8, longitude: -86.8 },
  { code: 'AK', fips: '02', name: 'Alaska', countryCode: 'US', latitude: 64.2, longitude: -152.4 },
  { code: 'AZ', fips: '04', name: 'Arizona', countryCode: 'US', latitude: 34.0, longitude: -111.0 },
  { code: 'AR', fips: '05', name: 'Arkansas', countryCode: 'US', latitude: 35.2, longitude: -91.8 },
  { code: 'CA', fips: '06', name: 'California', countryCode: 'US', latitude: 36.7, longitude: -119.4 },
  { code: 'CO', fips: '08', name: 'Colorado', countryCode: 'US', latitude: 39.5, longitude: -105.7 },
  { code: 'CT', fips: '09', name: 'Connecticut', countryCode: 'US', latitude: 41.6, longitude: -73.0 },
  { code: 'DE', fips: '10', name: 'Delaware', countryCode: 'US', latitude: 38.9, longitude: -75.5 },
  { code: 'FL', fips: '12', name: 'Florida', countryCode: 'US', latitude: 27.6, longitude: -81.5 },
  { code: 'GA', fips: '13', name: 'Georgia', countryCode: 'US', latitude: 32.1, longitude: -82.9 },
  { code: 'HI', fips: '15', name: 'Hawaii', countryCode: 'US', latitude: 19.8, longitude: -155.5 },
  { code: 'ID', fips: '16', name: 'Idaho', countryCode: 'US', latitude: 44.0, longitude: -114.7 },
  { code: 'IL', fips: '17', name: 'Illinois', countryCode: 'US', latitude: 40.6, longitude: -89.3 },
  { code: 'IN', fips: '18', name: 'Indiana', countryCode: 'US', latitude: 40.2, longitude: -86.1 },
  { code: 'IA', fips: '19', name: 'Iowa', countryCode: 'US', latitude: 41.8, longitude: -93.0 },
  { code: 'KS', fips: '20', name: 'Kansas', countryCode: 'US', latitude: 39.0, longitude: -98.4 },
  { code: 'KY', fips: '21', name: 'Kentucky', countryCode: 'US', latitude: 37.8, longitude: -84.2 },
  { code: 'LA', fips: '22', name: 'Louisiana', countryCode: 'US', latitude: 30.9, longitude: -91.9 },
  { code: 'ME', fips: '23', name: 'Maine', countryCode: 'US', latitude: 45.2, longitude: -69.4 },
  { code: 'MD', fips: '24', name: 'Maryland', countryCode: 'US', latitude: 39.0, longitude: -76.6 },
  { code: 'MA', fips: '25', name: 'Massachusetts', countryCode: 'US', latitude: 42.4, longitude: -71.3 },
  { code: 'MI', fips: '26', name: 'Michigan', countryCode: 'US', latitude: 44.3, longitude: -85.6 },
  { code: 'MN', fips: '27', name: 'Minnesota', countryCode: 'US', latitude: 46.7, longitude: -94.6 },
  { code: 'MS', fips: '28', name: 'Mississippi', countryCode: 'US', latitude: 32.3, longitude: -89.3 },
  { code: 'MO', fips: '29', name: 'Missouri', countryCode: 'US', latitude: 37.9, longitude: -91.8 },
  { code: 'MT', fips: '30', name: 'Montana', countryCode: 'US', latitude: 46.8, longitude: -110.3 },
  { code: 'NE', fips: '31', name: 'Nebraska', countryCode: 'US', latitude: 41.4, longitude: -99.9 },
  { code: 'NV', fips: '32', name: 'Nevada', countryCode: 'US', latitude: 38.8, longitude: -116.4 },
  { code: 'NH', fips: '33', name: 'New Hampshire', countryCode: 'US', latitude: 43.1, longitude: -71.5 },
  { code: 'NJ', fips: '34', name: 'New Jersey', countryCode: 'US', latitude: 40.0, longitude: -74.4 },
  { code: 'NM', fips: '35', name: 'New Mexico', countryCode: 'US', latitude: 34.5, longitude: -105.8 },
  { code: 'NY', fips: '36', name: 'New York', countryCode: 'US', latitude: 43.2, longitude: -74.2 },
  { code: 'NC', fips: '37', name: 'North Carolina', countryCode: 'US', latitude: 35.7, longitude: -79.0 },
  { code: 'ND', fips: '38', name: 'North Dakota', countryCode: 'US', latitude: 47.5, longitude: -101.0 },
  { code: 'OH', fips: '39', name: 'Ohio', countryCode: 'US', latitude: 40.4, longitude: -82.9 },
  { code: 'OK', fips: '40', name: 'Oklahoma', countryCode: 'US', latitude: 35.0, longitude: -97.0 },
  { code: 'OR', fips: '41', name: 'Oregon', countryCode: 'US', latitude: 43.8, longitude: -120.5 },
  { code: 'PA', fips: '42', name: 'Pennsylvania', countryCode: 'US', latitude: 41.2, longitude: -77.1 },
  { code: 'RI', fips: '44', name: 'Rhode Island', countryCode: 'US', latitude: 41.5, longitude: -71.4 },
  { code: 'SC', fips: '45', name: 'South Carolina', countryCode: 'US', latitude: 33.8, longitude: -81.1 },
  { code: 'SD', fips: '46', name: 'South Dakota', countryCode: 'US', latitude: 43.9, longitude: -99.9 },
  { code: 'TN', fips: '47', name: 'Tennessee', countryCode: 'US', latitude: 35.5, longitude: -86.5 },
  { code: 'TX', fips: '48', name: 'Texas', countryCode: 'US', latitude: 31.9, longitude: -99.9 },
  { code: 'UT', fips: '49', name: 'Utah', countryCode: 'US', latitude: 39.3, longitude: -111.0 },
  { code: 'VT', fips: '50', name: 'Vermont', countryCode: 'US', latitude: 44.5, longitude: -72.5 },
  { code: 'VA', fips: '51', name: 'Virginia', countryCode: 'US', latitude: 37.4, longitude: -78.6 },
  { code: 'WA', fips: '53', name: 'Washington', countryCode: 'US', latitude: 47.7, longitude: -120.7 },
  { code: 'WV', fips: '54', name: 'West Virginia', countryCode: 'US', latitude: 38.5, longitude: -80.4 },
  { code: 'WI', fips: '55', name: 'Wisconsin', countryCode: 'US', latitude: 43.7, longitude: -88.7 },
  { code: 'WY', fips: '56', name: 'Wyoming', countryCode: 'US', latitude: 43.0, longitude: -107.2 },
];

export const GEO_CITY_COORDINATE_CATALOG: readonly GeoCityReferenceEntry[] = [
  { name: 'Austin', countryCode: 'US', stateRegion: 'Texas', latitude: 30.2672, longitude: -97.7431 },
  { name: 'New York', countryCode: 'US', stateRegion: 'New York', latitude: 40.7128, longitude: -74.006 },
  { name: 'San Francisco', countryCode: 'US', stateRegion: 'California', latitude: 37.7749, longitude: -122.4194 },
  { name: 'Chicago', countryCode: 'US', stateRegion: 'Illinois', latitude: 41.8781, longitude: -87.6298 },
  { name: 'Seattle', countryCode: 'US', stateRegion: 'Washington', latitude: 47.6062, longitude: -122.3321 },
  { name: 'Miami', countryCode: 'US', stateRegion: 'Florida', latitude: 25.7617, longitude: -80.1918 },
  { name: 'Boston', countryCode: 'US', stateRegion: 'Massachusetts', latitude: 42.3601, longitude: -71.0589 },
  { name: 'Denver', countryCode: 'US', stateRegion: 'Colorado', latitude: 39.7392, longitude: -104.9903 },
  { name: 'Atlanta', countryCode: 'US', stateRegion: 'Georgia', latitude: 33.749, longitude: -84.388 },
  { name: 'Dallas', countryCode: 'US', stateRegion: 'Texas', latitude: 32.7767, longitude: -96.797 },
  { name: 'Los Angeles', countryCode: 'US', stateRegion: 'California', latitude: 34.0522, longitude: -118.2437 },
  { name: 'London', countryCode: 'GB', stateRegion: 'England', latitude: 51.5074, longitude: -0.1278 },
  { name: 'Manchester', countryCode: 'GB', stateRegion: 'England', latitude: 53.4808, longitude: -2.2426 },
  { name: 'Edinburgh', countryCode: 'GB', stateRegion: 'Scotland', latitude: 55.9533, longitude: -3.1883 },
  { name: 'Toronto', countryCode: 'CA', stateRegion: 'Ontario', latitude: 43.6532, longitude: -79.3832 },
  { name: 'Vancouver', countryCode: 'CA', stateRegion: 'British Columbia', latitude: 49.2827, longitude: -123.1207 },
  { name: 'Montreal', countryCode: 'CA', stateRegion: 'Quebec', latitude: 45.5017, longitude: -73.5673 },
  { name: 'Sydney', countryCode: 'AU', stateRegion: 'New South Wales', latitude: -33.8688, longitude: 151.2093 },
  { name: 'Melbourne', countryCode: 'AU', stateRegion: 'Victoria', latitude: -37.8136, longitude: 144.9631 },
  { name: 'Berlin', countryCode: 'DE', stateRegion: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { name: 'Munich', countryCode: 'DE', stateRegion: 'Bavaria', latitude: 48.1351, longitude: 11.582 },
  { name: 'Paris', countryCode: 'FR', stateRegion: 'Ile-de-France', latitude: 48.8566, longitude: 2.3522 },
  { name: 'Amsterdam', countryCode: 'NL', stateRegion: 'North Holland', latitude: 52.3676, longitude: 4.9041 },
  { name: 'Bengaluru', countryCode: 'IN', stateRegion: 'Karnataka', latitude: 12.9716, longitude: 77.5946 },
  { name: 'Mumbai', countryCode: 'IN', stateRegion: 'Maharashtra', latitude: 19.076, longitude: 72.8777 },
  { name: 'Delhi', countryCode: 'IN', stateRegion: 'Delhi', latitude: 28.7041, longitude: 77.1025 },
  { name: 'Dublin', countryCode: 'IE', stateRegion: 'Leinster', latitude: 53.3498, longitude: -6.2603 },
  { name: 'Singapore', countryCode: 'SG', stateRegion: 'Central', latitude: 1.3521, longitude: 103.8198 },
  { name: 'Dubai', countryCode: 'AE', stateRegion: 'Dubai', latitude: 25.2048, longitude: 55.2708 },
  { name: 'Tokyo', countryCode: 'JP', stateRegion: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Madrid', countryCode: 'ES', stateRegion: 'Madrid', latitude: 40.4168, longitude: -3.7038 },
  { name: 'Sao Paulo', countryCode: 'BR', stateRegion: 'Sao Paulo', latitude: -23.5505, longitude: -46.6333 },
];

export function resolveCountryEntry(input: string): GeoCountryCatalogEntry | null {
  const clean = input.trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  const normalized = clean.toLowerCase();

  const aliasMap: Record<string, string> = {
    UK: 'GB',
    USA: 'US',
    'UNITED STATES OF AMERICA': 'US',
    AMERICA: 'US',
    'GREAT BRITAIN': 'GB',
    UAE: 'AE',
  };
  const lookupUpper = aliasMap[upper] ?? upper;

  return (
    GEO_COUNTRY_CATALOG.find(
      (c) =>
        c.alpha2 === lookupUpper ||
        c.alpha3 === lookupUpper ||
        c.isoNumeric === clean ||
        c.name.toLowerCase() === normalized,
    ) ?? null
  );
}

export function resolveStateEntry(
  countryCode: string,
  stateInput: string,
): GeoStateCatalogEntry | null {
  const clean = stateInput.trim().toLowerCase();
  if (!clean) return null;
  const cc = (resolveCountryEntry(countryCode)?.alpha2 ?? countryCode).toUpperCase();
  return (
    US_STATE_CATALOG.find(
      (s) =>
        s.countryCode === cc &&
        (s.name.toLowerCase() === clean ||
          s.code.toLowerCase() === clean ||
          s.fips === stateInput.trim()),
    ) ?? null
  );
}

export function resolveCityCoordinates(
  countryCode: string,
  stateRegion: string,
  cityInput: string,
): { latitude: number; longitude: number } | null {
  const cleanCity = cityInput.trim().toLowerCase();
  if (cleanCity) {
    const cityMatch = GEO_CITY_COORDINATE_CATALOG.find(
      (c) =>
        c.name.toLowerCase() === cleanCity &&
        (!countryCode || c.countryCode === countryCode.toUpperCase()),
    );
    if (cityMatch) {
      return { latitude: cityMatch.latitude, longitude: cityMatch.longitude };
    }
  }
  const stateMatch = resolveStateEntry(countryCode, stateRegion);
  if (stateMatch) {
    return { latitude: stateMatch.latitude, longitude: stateMatch.longitude };
  }
  const countryMatch = resolveCountryEntry(countryCode);
  if (countryMatch) {
    return { latitude: countryMatch.latitude, longitude: countryMatch.longitude };
  }
  return null;
}
