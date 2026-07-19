// Normalized, indexable versions of free-text city/region so Firestore can
// filter with where() instead of downloading full collections and matching
// substrings client-side. Region names also vary across the app's registration
// screens (e.g. "Metropolitana" vs "Metropolitana de Santiago") — the alias
// table below collapses those to one canonical key.
const REGION_ALIASES: Record<string, string> = {
  metropolitana: 'metropolitana de santiago',
  araucania: 'la araucania',
};

function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function cityKey(city: string | null | undefined): string {
  return normalizeText(city);
}

export function regionKey(region: string | null | undefined): string {
  const normalized = normalizeText(region);
  return REGION_ALIASES[normalized] ?? normalized;
}

export function locationKeys(city: string | null | undefined, region: string | null | undefined) {
  return { cityKey: cityKey(city), regionKey: regionKey(region) };
}

// The region key used to scope a Firestore read to "near this owner" —
// always derived from address-picker data (their selected saved address, or
// their profile), never from GPS reverse-geocoding, which returns region
// names in a format that doesn't reliably match the app's canonical keys.
export function ownerFilterRegionKey(user: any): string | null {
  const addresses: any[] = user?.addresses ?? [];
  const selectedId = user?.selectedAddressId;
  const selectedAddr = addresses.find((a: any) => a.id === selectedId) ?? addresses[0];
  return selectedAddr?.regionKey ?? user?.regionKey ?? null;
}
