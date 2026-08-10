'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { auth, db } = initFirebase();

interface AuthContextType {
  user: User | null;
  // The raw Firebase Auth user — needed for updatePassword() in the
  // cambiar-contraseña screen, which app-level `user` (Firestore profile)
  // can't provide.
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  // Set when Firebase Auth succeeded but the app-level profile couldn't be
  // loaded (Firestore read failed, or no users/{uid} doc exists) — distinct
  // from a bad password, which signIn() below already rejects on its own.
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      try {
        if (fbUser) {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: fbUser.uid, ...userDoc.data() } as User);
            setAuthError(null);
          } else {
            setUser(null);
            setAuthError('Tu cuenta no tiene un perfil asociado. Contacta a soporte.');
          }
        } else {
          setUser(null);
        }
      } catch (e) {
        // A throw here (e.g. permission-denied reading the profile doc) used
        // to skip the setLoading(false) below entirely, leaving the app
        // stuck in a permanent loading state — the login form would show
        // success (signIn() itself resolved) but never redirect and never
        // surface an error either.
        console.error('Failed to load user profile after sign-in:', e);
        setUser(null);
        setAuthError('No se pudo cargar tu cuenta. Intenta de nuevo en unos segundos.');
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logOut() {
    await signOut(auth);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, authError, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
