import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getDatabase, connectDatabaseEmulator, Database } from 'firebase/database';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';

// Static dot-notation access required so Metro/Babel can inline values at bundle time.
// Dynamic process.env[variable] lookups are NOT replaced in Hermes production bundles.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let rtdb: Database | undefined;
let functionsInstance: Functions;

function initFirebase() {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      // Try to initialize with AsyncStorage persistence (React Native only).
      // getReactNativePersistence isn't exported by the installed firebase
      // version, so this always throws and we fall through to getAuth()
      // below. Kept as the primary attempt in case a future firebase bump
      // restores it. On web, calling initializeAuth(app) as a middle
      // fallback (previously here) silently produced an auth instance with
      // no working persistence — sessions didn't survive a page refresh.
      // getAuth() auto-selects indexedDB/localStorage/sessionStorage on web.
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const { getReactNativePersistence } = require('firebase/auth');
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      auth = getAuth(app);
    }
    db = getFirestore(app);
    storage = getStorage(app);
    // Cloud Functions are deployed to southamerica-west1, not the default
    // us-central1 — omitting the region here would 404 every callable.
    functionsInstance = getFunctions(app, 'southamerica-west1');
    const databaseURL = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '';
    if (databaseURL) rtdb = getDatabase(app, databaseURL);

    // Opt-in only — unset (the default) means every build, including local
    // dev, talks to the real production project exactly as before. Set
    // EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true (mobile) or
    // NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true (web) in .env.local to redirect
    // this app instance at `firebase emulators:start` instead. Host is
    // configurable because "localhost" doesn't reach the dev machine from
    // an Android emulator (needs 10.0.2.2) or a physical device (needs the
    // machine's LAN IP) — only the iOS simulator and web can rely on the
    // "localhost" default below.
    const useEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true' || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
    if (useEmulator) {
      const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || 'localhost';
      connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, host, 8080);
      connectFunctionsEmulator(functionsInstance, host, 5001);
      connectStorageEmulator(storage, host, 9199);
      if (rtdb) connectDatabaseEmulator(rtdb, host, 9000);
      console.log(`[firebase] Using local emulators at ${host} — NOT talking to production.`);
    }
  }
  // rtdb is only unset if EXPO_PUBLIC_FIREBASE_DATABASE_URL is missing from
  // the environment, which this app always sets — every call site already
  // assumes it's defined (passes it straight to ref()), so this asserts
  // that existing assumption instead of leaving it silently unchecked.
  return { app, auth, db, storage, rtdb: rtdb as Database, functions: functionsInstance };
}

export { initFirebase, firebaseConfig };
export type { FirebaseApp, Auth, Firestore, FirebaseStorage, Database, Functions };
