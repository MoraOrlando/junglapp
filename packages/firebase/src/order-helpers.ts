import { httpsCallable } from 'firebase/functions';
import { initFirebase } from './config';

interface CreateOrderProductsInput {
  storeId: string;
  products: { productId: string; productName: string; quantity: number; price: number; photoUrl?: string | null }[];
  deliveryMethod?: 'delivery' | 'pickup';
  shippingAddress?: string;
}

interface CreateOrderServiceInput {
  storeId: string;
  service: { serviceId?: string; serviceName: string; price?: number; duration?: string; note?: string };
  shippingAddress?: string;
}

// Routed through the createOrder Cloud Function instead of a direct
// addDoc(orders/...) — it needs to atomically enforce the Premium plan's
// weekly order cap for Basic stores, which a client-side Firestore write
// can't do reliably (see checkAndConsumeQuota in functions/src/index.ts).
export async function createOrder(input: CreateOrderProductsInput | CreateOrderServiceInput): Promise<string> {
  const { functions } = initFirebase();
  const fn = httpsCallable<typeof input, { id: string }>(functions, 'createOrder');
  const result = await fn(input);
  return result.data.id;
}

interface CreateAppointmentInput {
  vetId: string;
  petId?: string;
  date: string;
  time: string;
  reason?: string;
  type?: string;
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
}

// Same rationale as createOrder — atomically enforces the weekly
// appointment cap for Basic vets/trainers/walkers/groomers.
export async function createAppointment(input: CreateAppointmentInput): Promise<string> {
  const { functions } = initFirebase();
  const fn = httpsCallable<CreateAppointmentInput, { id: string }>(functions, 'createAppointment');
  const result = await fn(input);
  return result.data.id;
}
