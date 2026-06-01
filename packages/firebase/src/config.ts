import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getDatabase, Database } from 'firebase/database';

function getEnv(key: string): string {
  const expoKey = `EXPO_PUBLIC_${key}`;
  const nextKey = `NEXT_PUBLIC_${key}`;
  if (typeof process !== 'undefined') {
    return (process.env[expoKey] as string) || (process.env[nextKey] as string) || '';
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

    // initializeAuth with in-memory persistence — works on both RN and web
    // without requiring AsyncStorage native module setup
    try {
      auth = initializeAuth(app);
    } catch {
      // Auth was already initialized (e.g. hot reload) — retrieve existing instance
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
