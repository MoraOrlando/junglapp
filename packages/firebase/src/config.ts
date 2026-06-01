import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getDatabase, Database } from 'firebase/database';

// Works for both Expo (EXPO_PUBLIC_) and Next.js (NEXT_PUBLIC_) env prefixes
function getEnv(key: string): string {
  const expoKey = `EXPO_PUBLIC_${key}`;
  const nextKey = `NEXT_PUBLIC_${key}`;

  if (typeof process !== 'undefined') {
    return (
      (process.env[expoKey] as string) ||
      (process.env[nextKey] as string) ||
      ''
    );
  }
  return '';
}

const firebaseConfig = {
  apiKey: getEnv('FIREBASE_API_KEY'),
  authDomain: getEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('FIREBASE_APP_ID'),
  databaseURL: getEnv('FIREBASE_DATABASE_URL'),
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let rtdb: Database;

function initFirebase() {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

    // Use initializeAuth with AsyncStorage on React Native, fallback to getAuth on web
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      auth = getAuth(app);
    }

    db = getFirestore(app);
    storage = getStorage(app);
    rtdb = getDatabase(app);
  }
  return { app, auth, db, storage, rtdb };
}

export { initFirebase, firebaseConfig };
export type { FirebaseApp, Auth, Firestore, FirebaseStorage, Database };
