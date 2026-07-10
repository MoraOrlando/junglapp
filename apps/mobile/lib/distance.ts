// Haversine great-circle distance in kilometers.
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// True if `availability` has at least one time slot on today or a future date.
export function hasUpcomingAvailability(availability?: Record<string, string[]> | null): boolean {
  if (!availability) return false;
  const today = new Date().toISOString().slice(0, 10);
  return Object.entries(availability).some(([date, slots]) => date >= today && (slots?.length ?? 0) > 0);
}
