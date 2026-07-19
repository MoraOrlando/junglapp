/**
 * Run once to promote an existing user to the 'support' (admin) role.
 * Usage: node scripts/make-admin.js mora.munoz.orlando@gmail.com
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a Firebase service account JSON,
 * OR run from inside the firebase/ folder with admin SDK already initialized.
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('../firebase/service-account.json');

const app = initializeApp({ credential: cert(serviceAccount) });

const email = process.argv[2];
if (!email) { console.error('Usage: node make-admin.js <email>'); process.exit(1); }

(async () => {
  const db = getFirestore(app);
  const auth = getAuth(app);

  const user = await auth.getUserByEmail(email);
  await db.collection('users').doc(user.uid).update({ role: 'support' });
  console.log(`✅ Usuario ${email} ahora tiene rol 'support' (administrador)`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
