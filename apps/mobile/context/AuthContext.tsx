import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  initializeAuth,
  getAuth,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import { initFirebase } from '@junglapp/firebase';
import type { User, UserRole } from '@junglapp/types';

WebBrowser.maybeCompleteAuthSession();

const { app, db } = initFirebase();

// Initialize auth with AsyncStorage persistence so session survives app restarts
let auth: import('firebase/auth').Auth;
try {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

interface AuthContextType {
  user: User | null;
  firebaseUser: import('firebase/auth').User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<import('firebase/auth').User>;
  signUp: (email: string, password: string, userData: Omit<User, 'uid' | 'createdAt'>) => Promise<{ firebaseUser: import('firebase/auth').User }>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  logOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Google OAuth client IDs — replace with your real IDs from Google Cloud Console
const GOOGLE_CLIENT_IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

// Microsoft Azure AD app client ID
const MICROSOFT_CLIENT_ID = process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID ?? '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);
  const [loading, setLoading] = useState(true);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest(GOOGLE_CLIENT_IDS);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const id_token = googleResponse.params?.id_token;
      if (!id_token) return;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(async ({ user: fbUser }) => { await ensureUserDoc(fbUser, 'owner'); })
        .catch(() => {});
    }
  }, [googleResponse]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
        if (userDoc.exists()) {
          setUser({ uid: fbUser.uid, ...userDoc.data() } as User);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function ensureUserDoc(fbUser: import('firebase/auth').User, defaultRole: UserRole) {
    const ref = doc(db, 'users', fbUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const newUser: User = {
        uid: fbUser.uid,
        email: fbUser.email ?? '',
        name: fbUser.displayName ?? '',
        role: defaultRole,
        phone: '',
        address: '',
        region: '',
        city: '',
        createdAt: new Date().toISOString(),
        profileComplete: false,
      } as any;
      await setDoc(ref, newUser);
      setUser(newUser);
    } else {
      setUser({ uid: fbUser.uid, ...snap.data() } as User);
    }
  }

  async function signIn(email: string, password: string) {
    const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
    return fbUser;
  }

  async function signInWithGoogle() {
    await promptGoogleAsync();
  }

  async function signInWithMicrosoft() {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'junglapp' });
    const discovery = {
      authorizationEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://login.microsoftonline.com/common/oauth2/v2.0/token`,
    };
    const request = new AuthSession.AuthRequest({
      clientId: MICROSOFT_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
    });
    const result = await request.promptAsync(discovery);
    if (result.type === 'success') {
      const { id_token, access_token } = result.params;
      const provider = new OAuthProvider('microsoft.com');
      const credential = provider.credential({ idToken: id_token, accessToken: access_token });
      const { user: fbUser } = await signInWithCredential(auth, credential);
      await ensureUserDoc(fbUser, 'owner');
    }
  }

  async function signUp(
    email: string,
    password: string,
    userData: Omit<User, 'uid' | 'createdAt'>
  ) {
    const { user: fbUser } = await createUserWithEmailAndPassword(auth, email, password);
    const newUser: User = {
      ...userData,
      uid: fbUser.uid,
      email,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', fbUser.uid), newUser);
    setUser(newUser);
    return { firebaseUser: fbUser };
  }

  async function logOut() {
    // Remove biometric-stored credentials so they don't survive an explicit logout
    try {
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync('junglapp_saved_creds');
    } catch {}
    await signOut(auth);
    setUser(null);
  }

  async function updateProfile(data: Partial<User>) {
    if (!firebaseUser) return;
    // Strip all privilege-escalation and immutable fields before writing
    const { role, uid, createdAt, mustChangePassword, tempPasswordExpiresAt, ...safeData } = data as any;
    // Additional guard: never allow writing an empty object
    if (Object.keys(safeData).length === 0) return;
    await updateDoc(doc(db, 'users', firebaseUser.uid), safeData);
    setUser((prev) => (prev ? { ...prev, ...safeData } : null));
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signUp, signInWithGoogle, signInWithMicrosoft, logOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
