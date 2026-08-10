import { httpsCallable } from 'firebase/functions';
import { initFirebase } from './config';

// Registers the caller (and, server-side, every other participant) as a
// member of chatId in Realtime Database's chatMembers/ — required before
// reading/writing messages/{chatId} (see database.rules.json). Routed
// through this callable instead of a direct client-side `set()` because RTDB
// rules can't validate membership against Firestore's chats/{chatId}.participants —
// the Cloud Function does that check server-side before writing.
export async function joinChat(chatId: string): Promise<void> {
  const { functions } = initFirebase();
  const fn = httpsCallable<{ chatId: string }, { success: boolean }>(functions, 'joinChat');
  await fn({ chatId });
}
