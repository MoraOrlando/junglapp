import { httpsCallable } from 'firebase/functions';
import { initFirebase } from './config';

// Flags subscriptions/{uid}.upgradeRequestedAt so the admin dashboard's
// "Solicitudes de upgrade" section can surface it — never writes the plan
// itself, since subscriptions/{id} is isSupport()-only per firestore.rules.
export async function requestPremiumUpgrade(): Promise<void> {
  const { functions } = initFirebase();
  const fn = httpsCallable(functions, 'requestPremiumUpgrade');
  await fn({});
}

// Applies immediately — no admin approval loop, since a profile choosing to
// give up Premium on its own can't be abused the way self-granting it could.
export async function downgradeToBasic(): Promise<void> {
  const { functions } = initFirebase();
  const fn = httpsCallable(functions, 'downgradeToBasic');
  await fn({});
}
