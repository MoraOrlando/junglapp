import { collection, query, where, limit, type QueryConstraint } from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';

const { db } = initFirebase();

// Caps a collection read to the owner's region instead of downloading the
// whole collection. filterRegionKey must come from address-picker data
// (never GPS reverse-geocoding, which returns region names in a format
// that doesn't reliably match the app's canonical region keys) — pass null
// to fall back to an unfiltered-but-capped read.
const MAX_RESULTS_PER_QUERY = 200;

export function regionScopedQuery(
  collectionName: string,
  filterRegionKey: string | null,
  extraConstraints: QueryConstraint[] = [],
) {
  const constraints: QueryConstraint[] = [where('status', 'in', ['approved', 'pending']), ...extraConstraints];
  if (filterRegionKey) constraints.push(where('regionKey', '==', filterRegionKey));
  constraints.push(limit(MAX_RESULTS_PER_QUERY));
  return query(collection(db, collectionName), ...constraints);
}
