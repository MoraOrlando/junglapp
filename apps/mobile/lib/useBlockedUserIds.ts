import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../context/AuthContext';

const { db } = initFirebase();

// Chats/messages from blocked users must disappear from the blocker's feed
// instantly, per Apple App Store Guideline 1.2.
export function useBlockedUserIds(): Set<string> {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.BLOCKS), where('blockerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setBlocked(new Set(snap.docs.map((d) => d.data().blockedId as string)));
    }, () => {});
    return unsub;
  }, [user?.uid]);

  return blocked;
}
