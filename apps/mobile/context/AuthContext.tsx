import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
  FirebaseError,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { initFirebase } from '@junglapp/firebase';
import type { User, UserRole } from '@junglapp/types';

const { auth, db } = initFirebase();

interface AuthContextType {
  user: User | null;
  firebaseUser: import('firebase/auth').User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData: Omit<User, 'uid' | 'createdAt'>) => Promise<void>;
  logOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<import('firebase/auth').User | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
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
  }

  async function logOut() {
    await signOut(auth);
    setUser(null);
  }

  async function updateProfile(data: Partial<User>) {
    if (!firebaseUser) return;
    await updateDoc(doc(db, 'users', firebaseUser.uid), data);
    setUser((prev) => (prev ? { ...prev, ...data } : null));
  }

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, signIn, signUp, logOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
