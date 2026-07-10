import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  deleteUser,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { initFirebase } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { auth, db } = initFirebase();

interface AuthContextType {
  user: User | null;
  firebaseUser: import('firebase/auth').User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<import('firebase/auth').User>;
  signUp: (email: string, password: string, userData: Omit<User, 'uid' | 'createdAt'>) => Promise<{ firebaseUser: import('firebase/auth').User }>;
  logOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        setFirebaseUser(fbUser);
        if (fbUser) {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            // Blocked accounts (e.g. after a content-moderation decision)
            // can't resume a session, even a previously persisted one.
            if (userDoc.data()?.accountStatus === 'blocked') {
              await signOut(auth);
              setUser(null);
            } else {
              setUser({ uid: fbUser.uid, ...userDoc.data() } as User);
              registerPushToken(fbUser.uid);
            }
          }
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  async function registerPushToken(uid: string) {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'f180251b-69ce-4b38-a310-b8de516042fa',
      });
      await updateDoc(doc(db, 'users', uid), { pushToken: token.data });
    } catch {}
  }

  async function signIn(email: string, password: string) {
    const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
    return fbUser;
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

  async function deleteAccount() {
    if (!firebaseUser) return;
    try {
      await deleteDoc(doc(db, 'users', firebaseUser.uid));
    } catch {}
    try {
      await deleteUser(firebaseUser);
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        throw new Error('Por seguridad, cierra sesión, vuelve a iniciar sesión y luego intenta de nuevo.');
      }
      throw e;
    }
    setUser(null);
  }

  async function updateProfile(data: Partial<User>) {
    // Fall back to auth.currentUser: it's updated synchronously by the SDK,
    // while `firebaseUser` state can briefly lag right after sign-in (it's
    // only set once the onAuthStateChanged listener fires).
    const currentFbUser = firebaseUser ?? auth.currentUser;
    if (!currentFbUser) throw new Error('No hay una sesión activa. Vuelve a iniciar sesión e intenta de nuevo.');
    // Strip all privilege-escalation and immutable fields before writing
    const { role, uid, createdAt, mustChangePassword, tempPasswordExpiresAt, accountStatus, ...safeData } = data as any;
    // Additional guard: never allow writing an empty object
    if (Object.keys(safeData).length === 0) return;
    await updateDoc(doc(db, 'users', currentFbUser.uid), safeData);
    setUser((prev) => (prev ? { ...prev, ...safeData } : null));
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signUp, logOut, deleteAccount, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
