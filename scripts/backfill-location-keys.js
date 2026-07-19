/**
 * One-off migration: computes cityKey/regionKey (normalized, indexable
 * versions of the free-text city/region fields) for every existing document
 * so "Cerca de ti" can eventually query with where() instead of downloading
 * full collections and matching substrings client-side.
 *
 * Safe to re-run — it just recomputes and overwrites the key fields.
 *
 * Usage: node scripts/backfill-location-keys.js
 * Requires: firebase/service-account.json (same as scripts/make-admin.js)
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase/service-account.json');

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

// Keep in sync with apps/mobile/lib/locationKey.ts
const REGION_ALIASES = {
  metropolitana: 'metropolitana de santiago',
  araucania: 'la araucania',
};

function normalizeText(value) {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cityKey(city) {
  return normalizeText(city);
}

function regionKey(region) {
  const normalized = normalizeText(region);
  return REGION_ALIASES[normalized] ?? normalized;
}

async function backfillCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  let batch = db.batch();
  let opsInBatch = 0;
  let updated = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const updates = {};

    if (data.city !== undefined || data.region !== undefined) {
      updates.cityKey = cityKey(data.city);
      updates.regionKey = regionKey(data.region);
    }
    if (Array.isArray(data.addresses)) {
      updates.addresses = data.addresses.map((a) => ({
        ...a,
        cityKey: cityKey(a.city),
        regionKey: regionKey(a.region),
      }));
    }

    if (Object.keys(updates).length === 0) continue;
    batch.update(docSnap.ref, updates);
    opsInBatch++;
    updated++;

    if (opsInBatch === 500) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`${collectionName}: ${updated}/${snap.size} documentos actualizados`);
}

// Pets don't carry their own city/region — lookingForPartner pets denormalize
// the owner's regionKey so Match candidate queries can filter by region
// without exposing the owner's full profile (see apps/mobile/app/(owner)/pets/[id].tsx).
// Must run after the 'users' collection above so regionKeyByUid is fresh.
async function backfillPets() {
  const usersSnap = await db.collection('users').get();
  const regionKeyByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data().regionKey]));

  const petsSnap = await db.collection('pets').where('lookingForPartner', '==', true).get();
  let batch = db.batch();
  let opsInBatch = 0;
  let updated = 0;

  for (const docSnap of petsSnap.docs) {
    const ownerRegionKey = regionKeyByUid.get(docSnap.data().ownerId);
    if (!ownerRegionKey) continue;
    batch.update(docSnap.ref, { regionKey: ownerRegionKey });
    opsInBatch++;
    updated++;
    if (opsInBatch === 500) { await batch.commit(); batch = db.batch(); opsInBatch = 0; }
  }
  if (opsInBatch > 0) await batch.commit();
  console.log(`pets (lookingForPartner): ${updated}/${petsSnap.size} documentos actualizados`);
}

(async () => {
  const collections = ['users', 'veterinarians', 'walkers', 'stores', 'groomers', 'trainers'];
  for (const c of collections) {
    await backfillCollection(c);
  }
  await backfillPets();
  console.log('✅ Backfill completo');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
