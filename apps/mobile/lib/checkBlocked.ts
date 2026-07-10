import { doc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';

const { db } = initFirebase();

// A blocked user must not be able to keep messaging the person who blocked
// them — this is checked from the sender's side before every send, since
// Realtime Database security rules can't reference Firestore's `blocks`
// collection directly (separate products, no cross-database rule access).
export async function isBlockedByRecipient(recipientId: string, senderId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.BLOCKS, `${recipientId}_${senderId}`));
    return snap.exists();
  } catch {
    return false;
  }
}
