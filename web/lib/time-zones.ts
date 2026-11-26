import { DEFAULT_TIME_ZONE } from "@/lib/constants";

const FALLBACK_ZONES: readonly string[] = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Paris",
  "Europe/Athens",
  "Africa/Cairo",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const MODERN_NAMES: Readonly<Record<string, string>> = {
  "Africa/Asmera": "Africa/Asmara",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Catamarca": "America/Argentina/Catamarca",
  "America/Coral_Harbour": "America/Atikokan",
  "America/Cordoba": "America/Argentina/Cordoba",
  "America/Godthab": "America/Nuuk",
  "America/Indianapolis": "America/Indiana/Indianapolis",
  "America/Jujuy": "America/Argentina/Jujuy",
  "America/Louisville": "America/Kentucky/Louisville",
  "America/Mendoza": "America/Argentina/Mendoza",
  "America/Montreal": "America/Toronto",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Macao": "Asia/Macau",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ujung_Pandang": "Asia/Makassar",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Europe/Kiev": "Europe/Kyiv",
  "Pacific/Enderbury": "Pacific/Kanton",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Samoa": "Pacific/Pago_Pago",
  "Pacific/Truk": "Pacific/Chuuk",
};

const NO_ZONES: readonly string[] = [];

let known: readonly string[] | null = null;

export function modernZoneName(zone: string): string {
  return MODERN_NAMES[zone] ?? zone;
}

export function browserTimeZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? modernZoneName(zone) : null;
  } catch {
    return null;
  }
}

function supportedZones(): readonly string[] {
  try {
    return typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

export function buildZoneList(supported: readonly string[]): readonly string[] {
  const modern = supported.map(modernZoneName).filter((zone) => zone !== DEFAULT_TIME_ZONE);
  return [DEFAULT_TIME_ZONE, ...new Set(modern)];
}

export function knownTimeZones(): readonly string[] {
  known ??= buildZoneList(supportedZones());
  return known;
}

export function serverTimeZones(): readonly string[] {
  return NO_ZONES;
}

export function zoneOptions(zones: readonly string[], selected: string): readonly string[] {
  return zones.includes(selected) ? zones : [selected, ...zones];
}

export function timeZoneLabel(zone: string): string {
  return zone.replaceAll("_", " ");
}

export function zoneToSuggest(saved: string, browser: string | null): string | null {
  if (saved !== DEFAULT_TIME_ZONE || browser === null || browser === DEFAULT_TIME_ZONE) {
    return null;
  }
  return browser;
}
