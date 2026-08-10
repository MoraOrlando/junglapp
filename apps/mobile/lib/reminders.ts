import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import type { Reminder } from '@junglapp/types';

const { db } = initFirebase();

// Marca el reminder actual como realizado, registra una nueva visita médica
// (con la foto como comprobante) y, si se define una próxima fecha, arranca
// el siguiente ciclo creando un reminder nuevo — mismo patrón que ya usaba
// add-visit.tsx al registrar una visita con "próximo control", factorizado
// para reusarse también desde el modal de la home y la ficha médica.
export async function completeReminder(params: {
  reminder: Reminder;
  photoUri: string | null;
  nextDueDate: string | null;
}): Promise<void> {
  const { reminder, photoUri, nextDueDate } = params;

  let prescriptionUrl: string | null = null;
  if (photoUri) prescriptionUrl = await uploadImage(photoUri);

  const visitDoc = await addDoc(collection(db, COLLECTIONS.MEDICAL_VISITS), {
    petId: reminder.petId,
    ownerId: reminder.ownerId,
    date: new Date().toISOString().split('T')[0],
    visitReason: reminder.visitReason || 'Otro',
    vetName: reminder.vetName || 'Veterinario',
    vetId: null,
    rating: 0,
    notes: '',
    prescriptionUrl,
    nextControlDate: nextDueDate || null,
    previousVisitId: reminder.sourceVisitId || null,
    createdAt: new Date().toISOString(),
  });

  await updateDoc(doc(db, COLLECTIONS.REMINDERS, reminder.id), {
    done: true,
    completedAt: new Date().toISOString(),
  });

  if (nextDueDate) {
    await addDoc(collection(db, COLLECTIONS.REMINDERS), {
      ownerId: reminder.ownerId,
      petId: reminder.petId,
      type: reminder.type,
      visitReason: reminder.visitReason || null,
      date: nextDueDate,
      vetName: reminder.vetName || null,
      done: false,
      sourceVisitId: visitDoc.id,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function dismissReminder(reminderId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.REMINDERS, reminderId), {
    done: true,
    completedAt: new Date().toISOString(),
  });
}
