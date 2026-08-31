import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { randomInt, randomUUID } from 'crypto';
import { Expo } from 'expo-server-sdk';

admin.initializeApp();

// Firestore lives in southamerica-west1; deploying functions there too
// avoids the cross-continental round trip that 1st Gen could never avoid
// (southamerica-west1 isn't an available region for 1st Gen at all — that
// was the actual blocker, not just a missing config flag). The Realtime
// Database instance is the one exception — it's in us-central1, so
// onChatMessageCreated below overrides back to that region explicitly.
setGlobalOptions({ region: 'southamerica-west1' });

// Outgoing mail via Resend (junglapp.com verified as the sending domain)
// instead of Gmail SMTP — Gmail App Passwords aren't reliably available
// (Google gates them behind an unpredictable delay after enabling 2-Step
// Verification) and Gmail SMTP has poor deliverability/rate limits for
// automated sending anyway. Reports still land in soporte@junglapp.com's
// real inbox — only the *sending* path changed, not where admin alerts go.
const resendApiKey = defineSecret('RESEND_API_KEY');
const MAIL_FROM = 'JunglApp <soporte@junglapp.com>';
const ADMIN_NOTIFICATION_EMAIL = 'soporte@junglapp.com';

// CSPRNG-based password generator (replaces Math.random)
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[randomInt(chars.length)];
  }
  return password;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Escapes user-supplied text before it's interpolated into an HTML email —
// report fields (reason, reportedUserName) come straight from a client-writable
// Firestore doc, so without this a report could inject HTML/links into the
// admin notification.
function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export const sendTempPassword = onCall({ secrets: [resendApiKey] }, async (request) => {
  const { email } = request.data;

  // Input validation — length cap prevents ReDoS against the regex
  if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'Correo inválido.');
  }

  // App Check is enforced at the platform level; no additional auth token needed
  // for password-reset flows. The per-email rate limit below prevents enumeration.

  const normalizedEmail = email.trim().toLowerCase();

  // Rate limiting: 5-minute cooldown per email address
  const cooldownRef = admin.firestore().collection('_passwordResetCooldowns').doc(normalizedEmail);
  const cooldownDoc = await cooldownRef.get();
  if (cooldownDoc.exists) {
    const lastSent: FirebaseFirestore.Timestamp = cooldownDoc.data()!.lastSentAt;
    if (Date.now() - lastSent.toMillis() < 5 * 60 * 1000) {
      // Silently succeed — don't reveal rate limiting to callers
      return { success: true };
    }
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(normalizedEmail);
  } catch {
    // Don't reveal whether the email exists
    return { success: true };
  }

  const tempPassword = generateTempPassword();

  // Get user name before any mutations
  const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
  const userName = userDoc.data()?.name || 'Usuario';

  // Send email FIRST — only update password if delivery succeeds
  const resend = new Resend(resendApiKey.value());
  const { error: sendError } = await resend.emails.send({
    from: MAIL_FROM,
    to: normalizedEmail,
    subject: '🔑 Tu contraseña temporal - JunglApp',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
        </div>
        <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
          <p style="color: #374151; font-size: 16px;">Hola <strong>${userName}</strong>,</p>
          <p style="color: #6B7280;">Recibiste este correo porque solicitaste recuperar tu contraseña.</p>
          <p style="color: #374151; margin-top: 20px;">Tu <strong>contraseña temporal</strong> es:</p>
          <div style="background: #f0fdf4; border: 2px dashed #2D6A4F; border-radius: 10px; padding: 16px; text-align: center; margin: 16px 0;">
            <span style="font-size: 28px; font-weight: bold; color: #2D6A4F; letter-spacing: 4px;">${tempPassword}</span>
          </div>
          <p style="color: #6B7280; font-size: 13px;">⚠️ Esta contraseña expira en 24 horas. Al ingresar, la aplicación te pedirá crear una nueva contraseña.</p>
          <p style="color: #6B7280; font-size: 13px;">Si no solicitaste este cambio, ignora este correo — tu cuenta sigue segura.</p>
        </div>
        <p style="text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 16px;">© 2024 JunglApp — La app para el amor por las mascotas</p>
      </div>
    `,
  });
  if (sendError) {
    throw new HttpsError('internal', 'No se pudo enviar el correo. Intenta de nuevo más tarde.');
  }

  // Email sent successfully — now update auth and Firestore
  await admin.auth().updateUser(userRecord.uid, { password: tempPassword });
  await admin.firestore().collection('users').doc(userRecord.uid).update({
    mustChangePassword: true,
    tempPasswordSentAt: admin.firestore.FieldValue.serverTimestamp(),
    tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  // Record cooldown
  await cooldownRef.set({ lastSentAt: admin.firestore.FieldValue.serverTimestamp() });

  return { success: true };
});

// Lets a support/admin account reset a user's password directly, for cases
// where the self-service email in sendTempPassword above doesn't arrive
// (spam filtering, typo'd address, etc). Unlike sendTempPassword, this
// returns the temp password to the caller instead of emailing it — the
// admin is expected to relay it to the user through another channel
// (WhatsApp, SMS, in person).
export const adminResetUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  const callerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  if (callerDoc.data()?.role !== 'support') {
    throw new HttpsError('permission-denied', 'Solo soporte puede restablecer contraseñas.');
  }

  const { targetUid } = request.data;
  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el usuario objetivo.');
  }

  const targetDoc = await admin.firestore().collection('users').doc(targetUid).get();
  if (!targetDoc.exists) {
    throw new HttpsError('not-found', 'Usuario no encontrado.');
  }

  const tempPassword = generateTempPassword();
  await admin.auth().updateUser(targetUid, { password: tempPassword });
  await targetDoc.ref.update({
    mustChangePassword: true,
    tempPasswordSentAt: admin.firestore.FieldValue.serverTimestamp(),
    tempPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  return { tempPassword };
});

// Lets a store owner create a "collaborator" account with the same
// operational access to their store (products, orders, POS sales — see
// isStoreStaff() in firestore.rules). Must run server-side: creating a
// second Firebase Auth account from the client SDK would sign the caller
// out of their own session.
export const createStoreCollaborator = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  // The store doc's ID is the owner's own uid (see register-store.tsx),
  // so this doubles as the "is this caller actually a store owner" check.
  const storeDoc = await admin.firestore().collection('stores').doc(request.auth.uid).get();
  if (!storeDoc.exists) {
    throw new HttpsError('permission-denied', 'Solo el dueño de una tienda puede agregar colaboradores.');
  }
  const storeData = storeDoc.data()!;

  const { name, email, phone } = request.data as { name?: string; email?: string; phone?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Falta el nombre del colaborador.');
  }
  if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'Correo inválido.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  const existing = await admin.auth().getUserByEmail(normalizedEmail).catch(() => null);
  if (existing) {
    throw new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
  }

  const tempPassword = generateTempPassword();
  const newUser = await admin.auth().createUser({
    email: normalizedEmail,
    password: tempPassword,
    displayName: trimmedName,
  });

  await admin.firestore().collection('users').doc(newUser.uid).set({
    uid: newUser.uid,
    role: 'store',
    name: trimmedName,
    email: normalizedEmail,
    phone: typeof phone === 'string' ? phone.trim() : '',
    rut: '',
    address: '',
    region: '',
    city: '',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });

  await storeDoc.ref.update({
    staffUids: admin.firestore.FieldValue.arrayUnion(newUser.uid),
  });

  // Best-effort — the temp password is also returned below so the owner can
  // relay it manually (WhatsApp, in person) if this email doesn't arrive,
  // same fallback the support-side password reset already relies on.
  try {
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: MAIL_FROM,
      to: normalizedEmail,
      subject: `🔑 Te agregaron como colaborador de ${storeData.name || 'una tienda'} en JunglApp`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
          </div>
          <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; font-size: 16px;">Hola <strong>${trimmedName}</strong>,</p>
            <p style="color: #6B7280;">${storeData.name || 'Una tienda'} te agregó como colaborador en JunglApp. Ya puedes acceder al portal de tienda con estos datos:</p>
            <p style="color: #374151; margin-top: 16px;"><strong>Correo:</strong> ${normalizedEmail}</p>
            <p style="color: #374151;">Tu <strong>contraseña temporal</strong> es:</p>
            <div style="background: #f0fdf4; border: 2px dashed #2D6A4F; border-radius: 10px; padding: 16px; text-align: center; margin: 16px 0;">
              <span style="font-size: 28px; font-weight: bold; color: #2D6A4F; letter-spacing: 4px;">${tempPassword}</span>
            </div>
            <p style="color: #6B7280; font-size: 13px;">Al ingresar, la aplicación te pedirá crear una nueva contraseña.</p>
          </div>
        </div>
      `,
    });
  } catch {
    // Swallow — the caller still gets tempPassword back to relay manually.
  }

  return { uid: newUser.uid, tempPassword };
});

// Lets a veterinary clinic owner (isClinic: true) create a "collaborator"
// vet account that shares the clinic's agenda/patients — see isVetStaff() in
// firestore.rules. Mirrors createStoreCollaborator above field-for-field;
// must run server-side for the same reason (creating a second Firebase Auth
// account from the client SDK would sign the caller out of their own session).
export const createVetCollaborator = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }

  // The veterinarians doc's ID is the owner's own uid (see
  // apps/web/app/acceso/crear-cuenta/page.tsx), so this doubles as the "is
  // this caller actually the clinic owner" check.
  const vetDoc = await admin.firestore().collection('veterinarians').doc(request.auth.uid).get();
  if (!vetDoc.exists) {
    throw new HttpsError('permission-denied', 'Solo el dueño de una veterinaria puede agregar colaboradores.');
  }
  const vetData = vetDoc.data()!;
  if (!vetData.isClinic) {
    throw new HttpsError('permission-denied', 'Solo las veterinarias establecidas pueden agregar veterinarios colaboradores.');
  }

  const { name, email, phone } = request.data as { name?: string; email?: string; phone?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new HttpsError('invalid-argument', 'Falta el nombre del colaborador.');
  }
  if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
    throw new HttpsError('invalid-argument', 'Correo inválido.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  const existing = await admin.auth().getUserByEmail(normalizedEmail).catch(() => null);
  if (existing) {
    throw new HttpsError('already-exists', 'Ya existe una cuenta con ese correo.');
  }

  const tempPassword = generateTempPassword();
  const newUser = await admin.auth().createUser({
    email: normalizedEmail,
    password: tempPassword,
    displayName: trimmedName,
  });

  await admin.firestore().collection('users').doc(newUser.uid).set({
    uid: newUser.uid,
    role: 'vet',
    name: trimmedName,
    email: normalizedEmail,
    phone: typeof phone === 'string' ? phone.trim() : '',
    rut: '',
    address: '',
    region: '',
    city: '',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  });

  await vetDoc.ref.update({
    staffUids: admin.firestore.FieldValue.arrayUnion(newUser.uid),
  });

  // Best-effort — the temp password is also returned below so the owner can
  // relay it manually (WhatsApp, in person) if this email doesn't arrive,
  // same fallback createStoreCollaborator above relies on.
  try {
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: MAIL_FROM,
      to: normalizedEmail,
      subject: `🔑 Te agregaron como veterinario/a colaborador de ${vetData.name || 'una veterinaria'} en JunglApp`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
          </div>
          <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; font-size: 16px;">Hola <strong>${trimmedName}</strong>,</p>
            <p style="color: #6B7280;">${vetData.name || 'Una veterinaria'} te agregó como veterinario/a colaborador en JunglApp. Ya puedes acceder al panel de veterinaria con estos datos:</p>
            <p style="color: #374151; margin-top: 16px;"><strong>Correo:</strong> ${normalizedEmail}</p>
            <p style="color: #374151;">Tu <strong>contraseña temporal</strong> es:</p>
            <div style="background: #f0fdf4; border: 2px dashed #2D6A4F; border-radius: 10px; padding: 16px; text-align: center; margin: 16px 0;">
              <span style="font-size: 28px; font-weight: bold; color: #2D6A4F; letter-spacing: 4px;">${tempPassword}</span>
            </div>
            <p style="color: #6B7280; font-size: 13px;">Al ingresar, la aplicación te pedirá crear una nueva contraseña.</p>
          </div>
        </div>
      `,
    });
  } catch {
    // Swallow — the caller still gets tempPassword back to relay manually.
  }

  return { uid: newUser.uid, tempPassword };
});

const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};
// Callable functions have a ~10MB HTTP request ceiling. Base64 inflates the
// payload by ~4/3, so a 10MB *decoded* limit would actually need a ~13.3MB
// request — past that ceiling, the platform rejects the call before this
// function's own (friendlier) size check ever runs. Cap the decoded size
// low enough that its base64 form, plus JSON wrapper overhead, stays under
// the transport limit with headroom.
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

// Uploads a file to Storage on the client's behalf. React Native's `firebase` JS SDK
// cannot upload to Storage directly (unsupported by the Firebase team, see
// https://github.com/firebase/firebase-js-sdk/issues/8648), and the native
// @react-native-firebase/storage module doesn't share auth state with the JS SDK
// used everywhere else in this app. Routing uploads through a callable function
// sidesteps both problems: the client already has a valid ID token for the call,
// and the actual Storage write happens here via the Admin SDK (which bypasses
// Storage Security Rules, so this function must enforce its own checks).
export const uploadUserImage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para subir archivos.');
  }

  const { base64, ext } = request.data as { base64?: string; ext?: string };
  if (!base64 || typeof base64 !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el contenido de la imagen.');
  }

  const resolvedExt = ALLOWED_IMAGE_EXTENSIONS.includes((ext || '').toLowerCase())
    ? (ext as string).toLowerCase()
    : 'jpg';
  // Content-Type is derived from the validated extension, never taken from the
  // client — this function writes via the Admin SDK, which bypasses
  // storage.rules' isImageOrPdf() check, so an attacker-controlled contentType
  // (e.g. 'text/html') would otherwise let arbitrary bytes be served from our
  // bucket with a browser-executable content type.
  const resolvedContentType = IMAGE_MIME_TYPES[resolvedExt];

  if (!BASE64_REGEX.test(base64)) {
    // Buffer.from(str, 'base64') silently drops invalid characters instead of
    // throwing, so this regex check is the only thing that actually catches
    // malformed input.
    throw new HttpsError('invalid-argument', 'Contenido de imagen inválido.');
  }
  // Reject oversized payloads from their base64 string length (cheap) before
  // paying the cost of decoding into a buffer.
  const approxDecodedBytes = (base64.length * 3) / 4;
  if (approxDecodedBytes > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', `La imagen no debe superar los ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new HttpsError('invalid-argument', `La imagen no debe superar los ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const downloadToken = randomUUID();
  const filename = `uploads/${Date.now()}_${randomInt(1e9)}.${resolvedExt}`;
  const bucket = admin.storage().bucket();
  const file = bucket.file(filename);

  await file.save(buffer, {
    contentType: resolvedContentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });

  const encodedPath = encodeURIComponent(filename);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  return { url };
});

// Registers the caller as a member of a chat in Realtime Database, gated on
// actually being a participant per the Firestore chats/{chatId} doc. RTDB
// rules can't read Firestore, so chatMembers/{chatId}/{uid} is write:false
// there and this callable (Admin SDK, bypasses RTDB rules) is the only path
// to it — closes the gap where a client could self-register into ANY
// chatId's chatMembers just by knowing it, with no membership check at all.
export const joinChat = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const { chatId } = request.data as { chatId?: string };
  if (!chatId || typeof chatId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el chat.');
  }

  const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
  if (!chatDoc.exists) {
    throw new HttpsError('not-found', 'Chat no encontrado.');
  }
  const participants: string[] = chatDoc.data()?.participants || [];
  if (!participants.includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'No eres parte de este chat.');
  }

  // Registers every participant, not just the caller — mirrors what client
  // code already did before this fix (so whichever side opens the chat first
  // unblocks the other side's read/write too), but now done atomically and
  // with the membership check above instead of trusting the client.
  const updates: Record<string, boolean> = {};
  for (const uid of participants) {
    updates[`chatMembers/${chatId}/${uid}`] = true;
  }
  await admin.database().ref().update(updates);

  return { success: true };
});

type ProfileType = 'store' | 'veterinarian' | 'walker' | 'trainer' | 'groomer';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Atomically enforces the Premium plan feature: a 'basic' subscription may
// create at most 1 order/appointment per rolling week; 'premium' is
// unlimited. Every profile is born Premium (see the onXCreated triggers
// below, one per profile collection), so this "no subscription doc yet"
// branch is only a safety net — a pre-existing profile from before that
// trigger shipped, or a race where an order lands before the trigger
// finishes — and it now defaults to 'premium' too, consistent with that
// policy, rather than failing closed or silently downgrading anyone.
async function checkAndConsumeQuota(profileId: string, profileType: ProfileType): Promise<void> {
  const subRef = admin.firestore().collection('subscriptions').doc(profileId);
  await admin.firestore().runTransaction(async (tx) => {
    const subSnap = await tx.get(subRef);
    const nowIso = new Date().toISOString();

    if (!subSnap.exists) {
      tx.set(subRef, {
        profileType, plan: 'premium', weekCount: 0, weekStart: nowIso,
        createdAt: nowIso, updatedAt: nowIso,
      });
      return;
    }

    const sub = subSnap.data()!;
    if (sub.plan === 'premium') return;

    let weekCount = sub.weekCount ?? 0;
    let weekStart = sub.weekStart ?? nowIso;
    if (Date.now() - new Date(weekStart).getTime() >= WEEK_MS) {
      weekCount = 0;
      weekStart = nowIso;
    }
    if (weekCount >= 1) {
      throw new HttpsError(
        'resource-exhausted',
        'Esta tienda o profesional ya alcanzó su límite de pedidos/citas de la semana. Intenta de nuevo la próxima semana.'
      );
    }
    tx.update(subRef, { weekCount: weekCount + 1, weekStart, updatedAt: nowIso });
  });
}

// Replaces the client's direct addDoc(orders/...) — moved server-side so
// checkAndConsumeQuota above can count reliably (firestore.rules can't do
// atomic cross-request counters). Covers both product orders and the
// service-booking flow from the store portal (order.type === 'service').
export const createOrder = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const { storeId, products, service, deliveryMethod, shippingAddress } = request.data as {
    storeId?: string;
    products?: { productId: string; productName: string; quantity: number; price: number; photoUrl?: string | null }[];
    service?: { serviceId?: string; serviceName: string; price?: number; duration?: string; note?: string };
    deliveryMethod?: 'delivery' | 'pickup';
    shippingAddress?: string;
  };
  if (!storeId || typeof storeId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta la tienda.');
  }
  const isService = !!service;
  if (!isService && (!Array.isArray(products) || products.length === 0)) {
    throw new HttpsError('invalid-argument', 'Falta el detalle del pedido.');
  }

  await checkAndConsumeQuota(storeId, 'store');

  const buyerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const buyer = buyerDoc.data() ?? {};

  const total = isService
    ? Number(service!.price || 0)
    : products!.reduce((sum, p) => sum + Number(p.price || 0) * Number(p.quantity || 0), 0);

  const orderData: Record<string, unknown> = {
    buyerId: request.auth.uid,
    buyerName: buyer.name || '',
    buyerPhone: buyer.phone || '',
    storeId,
    total,
    status: 'pending',
    shippingAddress: shippingAddress || '',
    createdAt: new Date().toISOString(),
  };
  if (isService) {
    orderData.type = 'service';
    orderData.service = service;
  } else {
    orderData.products = products;
    if (deliveryMethod) orderData.deliveryMethod = deliveryMethod;
  }

  const ref = await admin.firestore().collection('orders').add(orderData);
  return { id: ref.id };
});

// Links a POS sale to a registered owner account by email, so it shows up in
// that person's in-app purchase history (apps/mobile/app/(owner)/historial.tsx)
// — matching by email requires an Admin SDK lookup across all `users`, which
// the client can't do (Firestore rules only let a user read their own doc).
// Best-effort from the caller's side: a non-matching email is not an error,
// it just means this particular customer doesn't have a JunglApp account.
export const linkPosSaleToBuyer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const { saleId, email } = request.data as { saleId?: string; email?: string };
  if (!saleId || typeof saleId !== 'string' || !email || typeof email !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta la venta o el correo.');
  }

  const saleRef = admin.firestore().collection('posSales').doc(saleId);
  const saleSnap = await saleRef.get();
  if (!saleSnap.exists) {
    throw new HttpsError('not-found', 'Venta no encontrada.');
  }
  const storeId = saleSnap.data()?.storeId as string | undefined;
  if (!storeId) {
    throw new HttpsError('failed-precondition', 'Venta sin tienda asociada.');
  }
  const storeDoc = await admin.firestore().collection('stores').doc(storeId).get();
  const isOwner = storeDoc.data()?.userId === request.auth.uid;
  const isStaff = ((storeDoc.data()?.staffUids as string[] | undefined) ?? []).includes(request.auth.uid);
  if (!isOwner && !isStaff) {
    throw new HttpsError('permission-denied', 'No eres parte de esta tienda.');
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email.trim().toLowerCase());
  } catch {
    return { linked: false };
  }
  const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
  if (userDoc.data()?.role !== 'owner') {
    return { linked: false };
  }

  await saleRef.update({ buyerId: userRecord.uid });
  return { linked: true };
});

// Emails the already-generated receipt PDF (apps/web/lib/receipt.ts, jsPDF —
// generated client-side, this only handles delivery) to a store customer.
export const sendReceiptEmail = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const { to, storeName, pdfBase64, total } = request.data as {
    to?: string; storeName?: string; pdfBase64?: string; total?: number;
  };
  if (!to || typeof to !== 'string' || !EMAIL_REGEX.test(to)) {
    throw new HttpsError('invalid-argument', 'Correo inválido.');
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta la boleta.');
  }

  const resend = new Resend(resendApiKey.value());
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: to.trim().toLowerCase(),
    subject: `🧾 Tu boleta de ${escapeHtml(storeName || 'tu compra')} — JunglApp`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
        </div>
        <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
          <p style="color: #374151; font-size: 16px;">Gracias por tu compra en <strong>${escapeHtml(storeName || 'la tienda')}</strong>.</p>
          ${total != null ? `<p style="color: #6B7280;">Total: <strong>$${Number(total).toLocaleString('es-CL')} CLP</strong></p>` : ''}
          <p style="color: #6B7280; font-size: 13px;">Tu boleta va adjunta en PDF a este correo.</p>
        </div>
      </div>
    `,
    attachments: [
      { filename: 'boleta.pdf', content: pdfBase64 },
    ],
  });
  if (error) {
    throw new HttpsError('internal', 'No se pudo enviar el correo. Intenta de nuevo más tarde.');
  }

  return { success: true };
});

const expo = new Expo();

async function sendPush(pushToken: string, title: string, body: string) {
  if (!Expo.isExpoPushToken(pushToken)) return;
  await expo.sendPushNotificationsAsync([{ to: pushToken, title, body, sound: 'default' }]);
}

async function getUserPushToken(uid: string): Promise<string | null> {
  const doc = await admin.firestore().collection('users').doc(uid).get();
  return doc.data()?.pushToken ?? null;
}

// appointments/{id}.vetId is the Firestore doc ID of whichever provider type
// booked it — vet, trainer, walker or groomer all write into the same
// collection (see firestore.rules isVetOfAppointment/isTrainerOfAppointment/
// isWalkerOfAppointment/isGroomerOfAppointment). This used to only check
// 'veterinarians', so trainer/walker/groomer bookings silently got no
// notification at all.
async function resolveProvider(providerId: string): Promise<{ userId: string; name: string; email: string; phone?: string; address?: string; profileType: ProfileType } | null> {
  const collections: Array<[ProfileType, string]> = [
    ['veterinarian', 'veterinarians'],
    ['trainer', 'trainers'],
    ['walker', 'walkers'],
    ['groomer', 'groomers'],
  ];
  const snaps = await Promise.all(collections.map(([, col]) => admin.firestore().collection(col).doc(providerId).get()));
  const idx = snaps.findIndex((s) => s.exists);
  if (idx === -1) return null;
  const data = snaps[idx].data()!;
  if (!data.userId || !data.email) return null;
  return {
    userId: data.userId, name: data.name || 'Profesional', email: data.email,
    phone: data.phone, address: data.address,
    profileType: collections[idx][0],
  };
}

// Replaces the client's direct writeBatch(appointments/..., clientLinks/...)
// used by vets/trainers/walkers/groomers booking screens — moved
// server-side for the same reason as createOrder above (atomic quota
// counting). resolveProvider also gives us provider.userId, needed for the
// clientLinks grant that used to be written by the client itself.
export const createAppointment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const { vetId, petId, date, time, reason, type, serviceId, serviceName, servicePrice, planPurchaseId } = request.data as {
    vetId?: string; petId?: string; date?: string; time?: string; reason?: string;
    type?: string; serviceId?: string; serviceName?: string; servicePrice?: number;
    planPurchaseId?: string;
  };
  if (!vetId || typeof vetId !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el profesional.');
  }
  if (!date || typeof date !== 'string' || !time || typeof time !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta la fecha u hora.');
  }

  const provider = await resolveProvider(vetId);
  if (!provider) {
    throw new HttpsError('not-found', 'Profesional no encontrado.');
  }

  // Booking against a walk-plan purchase skips the weekly quota — it's the
  // owner cashing in a walk they already paid for, not a new booking that
  // should count against the walker's plan limits.
  if (planPurchaseId) {
    const purchaseSnap = await admin.firestore().collection('walkPlanPurchases').doc(planPurchaseId).get();
    const purchase = purchaseSnap.data();
    if (!purchase || purchase.ownerId !== request.auth.uid || purchase.walkerId !== vetId) {
      throw new HttpsError('not-found', 'Plan de paseos no encontrado.');
    }
    if (purchase.status !== 'active' || (purchase.walksRemaining ?? 0) <= 0) {
      throw new HttpsError('failed-precondition', 'Tu plan de paseos no tiene paseos disponibles.');
    }
  } else {
    await checkAndConsumeQuota(vetId, provider.profileType);
  }

  const ownerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const ownerName = ownerDoc.data()?.name || 'Dueño';

  const apptData: Record<string, unknown> = {
    ownerId: request.auth.uid,
    ownerName,
    vetId,
    petId: petId || '',
    date,
    time,
    reason: reason || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  if (type) apptData.type = type;
  if (serviceId) apptData.serviceId = serviceId;
  if (serviceName) apptData.serviceName = serviceName;
  if (servicePrice != null) apptData.servicePrice = servicePrice;
  if (planPurchaseId) apptData.planPurchaseId = planPurchaseId;

  const apptRef = admin.firestore().collection('appointments').doc();
  const batch = admin.firestore().batch();
  batch.set(apptRef, apptData);
  batch.set(
    admin.firestore().collection('clientLinks').doc(`${provider.userId}_${request.auth.uid}`),
    { professionalId: provider.userId, ownerId: request.auth.uid },
    { merge: true }
  );
  await batch.commit();

  return { id: apptRef.id };
});

// Notifica (push + email) al profesional cuando se crea una nueva cita —
// como recordatorio, ya que no siempre revisan la app al momento.
export const onAppointmentCreated = onDocumentCreated({ document: 'appointments/{appointmentId}', secrets: [resendApiKey] }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const appt = snap.data();
  const { vetId, ownerId, ownerName, date, time, reason, petId } = appt;
  if (!vetId) return;

  const provider = await resolveProvider(vetId);
  if (!provider) return;

  const [token, petSnap, ownerDoc] = await Promise.all([
    getUserPushToken(provider.userId),
    petId ? admin.firestore().collection('pets').doc(petId).get() : Promise.resolve(null),
    ownerId ? admin.firestore().collection('users').doc(ownerId).get() : Promise.resolve(null),
  ]);
  const petName = petSnap?.exists ? (petSnap.data()?.name as string | undefined) : undefined;
  const ownerEmail = ownerDoc?.exists ? (ownerDoc.data()?.email as string | undefined) : undefined;

  if (token) {
    await sendPush(token, 'Nueva reserva', `${ownerName} agendó una cita para el ${date} a las ${time}`);
  }

  const detailsHtml = `
    <div style="background: #f0fdf4; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <p style="margin: 4px 0;"><strong>Fecha:</strong> ${escapeHtml(date)}</p>
      <p style="margin: 4px 0;"><strong>Hora:</strong> ${escapeHtml(time)}</p>
      ${reason ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
    </div>
  `;

  try {
    const resend = new Resend(resendApiKey.value());
    const { error: providerMailError } = await resend.emails.send({
      from: MAIL_FROM,
      to: provider.email,
      subject: `📅 Nueva reserva — ${escapeHtml(ownerName || 'un cliente')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
          </div>
          <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; font-size: 16px;">Hola <strong>${escapeHtml(provider.name)}</strong>,</p>
            <p style="color: #6B7280;">Tienes una nueva reserva agendada en JunglApp, como recordatorio te enviamos los detalles:</p>
            <div style="background: #f0fdf4; border-radius: 10px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Cliente:</strong> ${escapeHtml(ownerName || 'No especificado')}</p>
              ${petName ? `<p style="margin: 4px 0;"><strong>Mascota:</strong> ${escapeHtml(petName)}</p>` : ''}
              <p style="margin: 4px 0;"><strong>Fecha:</strong> ${escapeHtml(date)}</p>
              <p style="margin: 4px 0;"><strong>Hora:</strong> ${escapeHtml(time)}</p>
              ${reason ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>` : ''}
            </div>
            <p style="color: #6B7280; font-size: 13px;">Revisa y confirma la cita desde la app de JunglApp.</p>
          </div>
        </div>
      `,
    });
    if (providerMailError) console.error('onAppointmentCreated: provider email failed', providerMailError);
  } catch (e) {
    // Best-effort — the push notification above already went out.
    console.error('onAppointmentCreated: provider email threw', e);
  }

  // Confirmation to the pet owner, with the provider's contact info — same
  // best-effort pattern, doesn't affect the provider notification above.
  if (ownerEmail) {
    try {
      const resend = new Resend(resendApiKey.value());
      const { error: ownerMailError } = await resend.emails.send({
        from: MAIL_FROM,
        to: ownerEmail,
        subject: `📅 Tu cita quedó agendada — ${escapeHtml(provider.name)}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
            </div>
            <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
              <p style="color: #374151; font-size: 16px;">Hola <strong>${escapeHtml(ownerName || 'Dueño')}</strong>,</p>
              <p style="color: #6B7280;">Tu cita con <strong>${escapeHtml(provider.name)}</strong> quedó agendada. Estos son los detalles:</p>
              ${detailsHtml}
              <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; margin-top: 4px;">
                <p style="margin: 4px 0; color: #6B7280; font-size: 13px;">Datos de contacto</p>
                ${provider.phone ? `<p style="margin: 4px 0;"><strong>Teléfono:</strong> ${escapeHtml(provider.phone)}</p>` : ''}
                ${provider.address ? `<p style="margin: 4px 0;"><strong>Dirección:</strong> ${escapeHtml(provider.address)}</p>` : ''}
              </div>
              <p style="color: #6B7280; font-size: 13px; margin-top: 12px;">Revisa el estado de tu cita desde la app de JunglApp.</p>
            </div>
          </div>
        `,
      });
      if (ownerMailError) console.error('onAppointmentCreated: owner email failed', ownerMailError);
    } catch (e) {
      // Best-effort — the provider notification above already went out.
      console.error('onAppointmentCreated: owner email threw', e);
    }
  }
});

// Notifica por email a la tienda cuando llega un pedido de productos o una
// reserva de servicio, como recordatorio (no hay ningún otro aviso
// automático hoy — el dueño tenía que revisar el portal manualmente).
export const onOrderCreated = onDocumentCreated({ document: 'orders/{orderId}', secrets: [resendApiKey] }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data();
  const { storeId, buyerName, buyerPhone, shippingAddress, deliveryMethod, products, total, type, service } = order;
  if (!storeId) return;

  const storeDoc = await admin.firestore().collection('stores').doc(storeId).get();
  if (!storeDoc.exists) return;
  const store = storeDoc.data()!;
  if (!store.email) return;

  const isService = type === 'service' && service;
  const itemsHtml = isService
    ? `<p style="margin: 4px 0;"><strong>Servicio:</strong> ${escapeHtml(service.serviceName)}</p>`
      + (service.note ? `<p style="margin: 4px 0;"><strong>Nota:</strong> ${escapeHtml(service.note)}</p>` : '')
    : ((products || []) as { quantity?: number; productName?: string }[])
        .map((p) => `<p style="margin: 4px 0;">• ${escapeHtml(p.quantity ?? '')}x ${escapeHtml(p.productName ?? '')}</p>`)
        .join('');

  try {
    const resend = new Resend(resendApiKey.value());
    const { error: orderMailError } = await resend.emails.send({
      from: MAIL_FROM,
      to: store.email,
      subject: isService ? '📅 Nueva reserva de servicio — JunglApp' : '🛒 Nuevo pedido — JunglApp',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #f9fafb; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2D6A4F; font-size: 28px; margin: 0;">🐾 JunglApp</h1>
          </div>
          <div style="background: white; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
            <p style="color: #374151; font-size: 16px;">Hola <strong>${escapeHtml(store.name || 'Tienda')}</strong>,</p>
            <p style="color: #6B7280;">${isService ? 'Tienes una nueva reserva de servicio' : 'Tienes un nuevo pedido'} en JunglApp. Como recordatorio, estos son los detalles:</p>
            <div style="background: #f0fdf4; border-radius: 10px; padding: 16px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Cliente:</strong> ${escapeHtml(buyerName || 'No especificado')}</p>
              ${buyerPhone ? `<p style="margin: 4px 0;"><strong>Teléfono:</strong> ${escapeHtml(buyerPhone)}</p>` : ''}
              ${itemsHtml}
              <p style="margin: 4px 0;"><strong>Total:</strong> $${Number(total || 0).toLocaleString('es-CL')} CLP</p>
              ${deliveryMethod ? `<p style="margin: 4px 0;"><strong>Entrega:</strong> ${deliveryMethod === 'pickup' ? 'Retiro en tienda' : 'Despacho'}</p>` : ''}
              ${shippingAddress ? `<p style="margin: 4px 0;"><strong>Dirección:</strong> ${escapeHtml(shippingAddress)}</p>` : ''}
            </div>
            <p style="color: #6B7280; font-size: 13px;">Revisa y gestiona esta solicitud desde el portal de tienda de JunglApp.</p>
          </div>
        </div>
      `,
    });
    if (orderMailError) console.error('onOrderCreated: store email failed', orderMailError);
  } catch (e) {
    // Best-effort — don't fail the trigger if email delivery fails.
    console.error('onOrderCreated: store email threw', e);
  }
});

// Notifica al owner cuando cambia el estado de su cita
export const onAppointmentUpdated = onDocumentUpdated('appointments/{appointmentId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  // Consumes one walk from the linked WalkPlanPurchase the moment a
  // plan-booked appointment completes — whoever marks it done (owner or
  // walker both just updateDoc the same appointment client-side, see
  // apps/mobile/app/(owner)/appointment/[id].tsx and (walker)/appointment/[id].tsx).
  // planDecremented guards against double-consuming if this trigger ever
  // re-runs for the same completion.
  if (after.status === 'completed' && after.planPurchaseId && !after.planDecremented) {
    const apptRef = event.data!.after.ref;
    const purchaseRef = admin.firestore().collection('walkPlanPurchases').doc(after.planPurchaseId);
    await admin.firestore().runTransaction(async (tx) => {
      const [purchaseSnap, apptSnap] = await Promise.all([tx.get(purchaseRef), tx.get(apptRef)]);
      if (apptSnap.data()?.planDecremented) return; // already handled by a concurrent run
      if (!purchaseSnap.exists) { tx.update(apptRef, { planDecremented: true }); return; }
      const remaining = Math.max((purchaseSnap.data()!.walksRemaining ?? 0) - 1, 0);
      tx.update(purchaseRef, {
        walksRemaining: remaining,
        ...(remaining === 0 ? { status: 'exhausted' } : {}),
      });
      tx.update(apptRef, { planDecremented: true });
    });
  }

  const { ownerId, date, time } = after;
  if (!ownerId) return;

  const token = await getUserPushToken(ownerId);
  if (!token) return;

  if (after.status === 'confirmed') {
    await sendPush(token, 'Cita confirmada', `Tu cita del ${date} a las ${time} fue confirmada`);
  } else if (after.status === 'cancelled') {
    await sendPush(token, 'Cita cancelada', `La cita del ${date} a las ${time} fue cancelada`);
  }
});

// apps/mobile/lib/visitReasons.ts is the source of truth for these labels on
// the client — functions/ isn't part of the monorepo workspaces (doesn't
// depend on @junglapp/types), so the small map is duplicated here instead.
const REMINDER_LABEL: Record<string, string> = {
  vaccine: 'vacuna',
  antiparasitic: 'control antiparasitario',
  vet_control: 'control veterinario',
};

// Primera Cloud Function programada del proyecto: revisa diariamente los
// reminders de vacunas/antiparasitarios/controles vencidos o próximos (en 3
// días) y envía un push real, para avisar al dueño aunque no tenga la app
// abierta. lastNotifiedDate evita reenviar el mismo aviso el mismo día en
// corridas repetidas o si un reminder califica en ambos rangos.
// Cloud Scheduler (a diferencia de Cloud Functions v2) no soporta la región
// southamerica-west1 todavía — mismo tipo de excepción que onChatMessageCreated
// más abajo, así que se sobreescribe a us-central1 explícitamente.
export const sendVetReminderPushesV2 = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => {
    const db = admin.firestore();
    const todayStr = new Date().toISOString().split('T')[0];
    const in3DaysStr = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [overdueSnap, upcomingSnap] = await Promise.all([
      db.collection('reminders').where('done', '==', false).where('date', '<=', todayStr).get(),
      db.collection('reminders').where('done', '==', false).where('date', '==', in3DaysStr).get(),
    ]);

    type Job = { ref: FirebaseFirestore.DocumentReference; ownerId: string; petId: string; type: string; date: string; kind: 'due' | 'upcoming' };
    const jobs: Job[] = [];
    const seen = new Set<string>();
    const addJobs = (snap: FirebaseFirestore.QuerySnapshot, kind: Job['kind']) => {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue; // a reminder could match both ranges (e.g. date == today == in3Days edge case)
        const data = d.data();
        if (data.lastNotifiedDate === todayStr) continue; // already notified today
        if (!data.ownerId || !data.petId) continue;
        seen.add(d.id);
        jobs.push({ ref: d.ref, ownerId: data.ownerId, petId: data.petId, type: data.type ?? 'vet_control', date: data.date, kind });
      }
    };
    addJobs(overdueSnap, 'due');
    addJobs(upcomingSnap, 'upcoming');
    if (jobs.length === 0) return;

    // Batch fetch — one .get() per unique owner/pet instead of one per job,
    // since several jobs can share the same owner or pet.
    const ownerIds = [...new Set(jobs.map((j) => j.ownerId))];
    const petIds = [...new Set(jobs.map((j) => j.petId))];
    const [tokenEntries, petEntries] = await Promise.all([
      Promise.all(ownerIds.map(async (uid) => [uid, await getUserPushToken(uid)] as const)),
      Promise.all(petIds.map(async (pid) => [pid, (await db.collection('pets').doc(pid).get()).data()?.name ?? 'tu mascota'] as const)),
    ]);
    const tokenByOwner = new Map(tokenEntries);
    const petNameById = new Map(petEntries);

    const messages = jobs
      .map((job) => {
        const token = tokenByOwner.get(job.ownerId);
        if (!token || !Expo.isExpoPushToken(token)) return null;
        const label = REMINDER_LABEL[job.type] ?? 'control veterinario';
        const petName = petNameById.get(job.petId) ?? 'tu mascota';
        const title = job.kind === 'due' ? `🔔 ${label} pendiente` : `📅 ${label} en 3 días`;
        const body = job.kind === 'due'
          ? `${petName} tiene un/a ${label} pendiente desde el ${job.date}.`
          : `${petName} tiene un/a ${label} programado/a para el ${job.date}.`;
        return { to: token, title, body, sound: 'default' as const, data: { petId: job.petId } };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    for (const chunk of expo.chunkPushNotifications(messages)) {
      await expo.sendPushNotificationsAsync(chunk).catch((e) => console.error('sendVetReminderPushesV2 push error', e));
    }

    // Mark every processed job (with or without a valid token) so the next
    // run doesn't re-select it today.
    await Promise.all(jobs.map((j) => j.ref.update({ lastNotifiedDate: todayStr })));
  }
);

// Notifica a ambos dueños cuando dos mascotas hacen match mutuo. La app solo
// muestra el modal "¡Es un match!" al dueño que está mirando la pantalla en
// ese momento — el otro dueño (quien dio like primero, y ya salió de la app)
// no tenía ninguna señal de que el match ocurrió hasta que abriera el chat
// por su cuenta.
export const onMatchCompleted = onDocumentUpdated('matches/{matchId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status || after.status !== 'matched') return;

  const { owner1Id, owner2Id, pet1Id, pet2Id } = after;
  if (!owner1Id || !owner2Id) return;

  const [pet1Snap, pet2Snap] = await Promise.all([
    admin.firestore().collection('pets').doc(pet1Id).get(),
    admin.firestore().collection('pets').doc(pet2Id).get(),
  ]);
  const pet1Name = pet1Snap.data()?.name || 'Tu mascota';
  const pet2Name = pet2Snap.data()?.name || 'Tu mascota';

  const [token1, token2] = await Promise.all([
    getUserPushToken(owner1Id),
    getUserPushToken(owner2Id),
  ]);

  await Promise.all([
    token1 ? sendPush(token1, '🔥 ¡Nuevo match!', `${pet1Name} y ${pet2Name} hicieron match`) : Promise.resolve(),
    token2 ? sendPush(token2, '🔥 ¡Nuevo match!', `${pet1Name} y ${pet2Name} hicieron match`) : Promise.resolve(),
  ]);
});

// Descuenta stock cuando la tienda confirma un pedido — no al crearlo, para
// no tocar inventario por pedidos que terminan siendo rechazados.
export const onOrderConfirmed = onDocumentUpdated('orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status || after.status !== 'confirmed') return;

  const items: { productId?: string; quantity?: number }[] = after.products || [];
  const now = new Date().toISOString();

  await Promise.all(
    items.map(async (item) => {
      if (!item.productId || !item.quantity) return;
      const productRef = admin.firestore().collection('products').doc(item.productId);
      try {
        await admin.firestore().runTransaction(async (tx) => {
          const snap = await tx.get(productRef);
          if (!snap.exists) return;
          const currentStock = snap.data()?.stock ?? 0;
          tx.update(productRef, {
            stock: Math.max(0, currentStock - (item.quantity as number)),
            lastSoldAt: now,
          });
        });
      } catch {
        // A single missing/racing product shouldn't fail the rest of the order.
      }
    })
  );
});

// Notifica al destinatario cuando llega un mensaje de chat. La Realtime
// Database de este proyecto vive en us-central1 (a diferencia de Firestore,
// que está en southamerica-west1) — se fija la región explícitamente acá
// para no heredar el default global southamerica-west1 del resto del
// archivo, que rompería este trigger específico.
export const onChatMessageCreated = onValueCreated(
  { ref: '/messages/{chatId}/{messageId}', region: 'us-central1' },
  async (event) => {
    const message = event.data.val();
    const { senderId, senderName, text, imageUrl } = message;
    const { chatId } = event.params;

    const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
    const participants: string[] = chatDoc.data()?.participants ?? [];
    const recipientId = participants.find((p) => p !== senderId);
    if (!recipientId) return;

    // Don't notify a user about messages from someone they've blocked — the
    // client already hides the chat from their list, but without this check
    // they'd still get pinged (Apple Guideline 1.2 requires blocking to
    // actually stop contact, not just hide it visually).
    const blockDoc = await admin.firestore().collection('blocks').doc(`${recipientId}_${senderId}`).get();
    if (blockDoc.exists) return;

    const token = await getUserPushToken(recipientId);
    if (!token) return;

    const body = imageUrl ? '📷 Foto' : (text || '...');
    await sendPush(token, senderName || 'Nuevo mensaje', body);
  }
);

// Recalculate trainer/vet rating server-side when a review is created.
// Prevents client-side rating manipulation.
export const onReviewCreated = onDocumentCreated('reviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const review = snap.data();
  const { vetId, rating } = review;
  if (!vetId || typeof rating !== 'number') return;

  // Determine target collection (trainer or veterinarian)
  const trainerRef = admin.firestore().collection('trainers').doc(vetId);
  const vetRef = admin.firestore().collection('veterinarians').doc(vetId);

  for (const ref of [trainerRef, vetRef]) {
    const target = await ref.get();
    if (!target.exists) continue;

    const allReviewsSnap = await admin.firestore()
      .collection('reviews')
      .where('vetId', '==', vetId)
      .get();

    const ratings = allReviewsSnap.docs.map((d) => d.data().rating as number);
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;

    await ref.update({
      rating: Math.round(avg * 10) / 10,
      reviewCount: ratings.length,
    });
    break;
  }
});

// Recalculate a community place's rating server-side when a review is
// created — same rationale as onReviewCreated (prevents client-side rating
// manipulation).
export const onPlaceReviewCreated = onDocumentCreated('placeReviews/{reviewId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const review = snap.data();
  const { placeId, rating } = review;
  if (!placeId || typeof rating !== 'number') return;

  const placeRef = admin.firestore().collection('places').doc(placeId);
  const placeDoc = await placeRef.get();
  if (!placeDoc.exists) return;

  const allReviewsSnap = await admin.firestore()
    .collection('placeReviews')
    .where('placeId', '==', placeId)
    .get();

  const ratings = allReviewsSnap.docs.map((d) => d.data().rating as number);
  const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;

  await placeRef.update({
    rating: Math.round(avg * 10) / 10,
    reviewCount: ratings.length,
  });
});

// Notifies the admin by email whenever a user reports objectionable content,
// so it can be reviewed and acted on within 24 hours (Apple Guideline 1.2).
export const onReportCreated = onDocumentCreated({ document: 'reports/{reportId}', secrets: [resendApiKey] }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const report = snap.data();

  // Flag the reported account for admin review — unless it's already
  // blocked, in which case it should stay blocked, not get "downgraded".
  if (report.reportedUserId) {
    try {
      const userRef = admin.firestore().collection('users').doc(report.reportedUserId);
      const userDoc = await userRef.get();
      if (userDoc.exists && userDoc.data()?.accountStatus !== 'blocked') {
        await userRef.update({ accountStatus: 'under_review' });
      }
    } catch {
      // Don't block the email notification below if this fails
    }
  }

  const resend = new Resend(resendApiKey.value());
  await resend.emails.send({
    from: MAIL_FROM,
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: '⚠️ Nuevo reporte de contenido — JunglApp',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #DC2626;">Nuevo reporte de contenido</h2>
        <p><strong>Reportado por:</strong> ${escapeHtml(report.reporterId)}</p>
        <p><strong>Usuario reportado:</strong> ${escapeHtml(report.reportedUserName || report.reportedUserId)} (${escapeHtml(report.reportedUserId)})</p>
        <p><strong>Chat:</strong> ${escapeHtml(report.chatId)}</p>
        <p><strong>Motivo:</strong> ${escapeHtml(report.reason)}</p>
        <p style="color: #6B7280; font-size: 13px; margin-top: 24px;">Revisa y actúa dentro de 24 horas desde Firebase Console → Firestore → reports.</p>
      </div>
    `,
  });
});

// Every professional profile is born on the Premium plan — support can
// still downgrade it later from the admin dashboard, but nobody should have
// to wait on a manual assignment (or place a first order/appointment,
// which is what used to lazily provision a 'basic' subscription doc) just
// to stop being capped. One trigger per collection since Firestore
// document triggers can't wildcard across unrelated collections.
function createPremiumSubscription(profileType: ProfileType) {
  return async (event: { params: { id: string }; data?: FirebaseFirestore.DocumentSnapshot }) => {
    if (!event.data) return;
    const subRef = admin.firestore().collection('subscriptions').doc(event.params.id);
    if ((await subRef.get()).exists) return;
    const nowIso = new Date().toISOString();
    await subRef.set({
      profileType, plan: 'premium', weekCount: 0, weekStart: nowIso,
      createdAt: nowIso, updatedAt: nowIso,
    });
  };
}

export const onStoreCreated = onDocumentCreated('stores/{id}', createPremiumSubscription('store'));
export const onVeterinarianCreated = onDocumentCreated('veterinarians/{id}', createPremiumSubscription('veterinarian'));
export const onWalkerCreated = onDocumentCreated('walkers/{id}', createPremiumSubscription('walker'));
export const onTrainerCreated = onDocumentCreated('trainers/{id}', createPremiumSubscription('trainer'));
export const onGroomerCreated = onDocumentCreated('groomers/{id}', createPremiumSubscription('groomer'));

const PROFILE_COLLECTIONS: Record<ProfileType, string> = {
  store: 'stores',
  veterinarian: 'veterinarians',
  walker: 'walkers',
  trainer: 'trainers',
  groomer: 'groomers',
};

// Profiles created before the onXCreated triggers above shipped (or a trigger
// run that raced/failed) can reach requestPremiumUpgrade/downgradeToBasic
// with no subscriptions/{uid} doc yet. Resolve which collection actually
// owns this uid so callers below can backfill the doc on the spot instead of
// failing closed — consistent with the "every profile is born Premium"
// policy the triggers already enforce for new signups.
async function resolveProfileType(uid: string): Promise<ProfileType | null> {
  const entries = Object.entries(PROFILE_COLLECTIONS) as [ProfileType, string][];
  const snaps = await Promise.all(
    entries.map(([, collection]) => admin.firestore().collection(collection).doc(uid).get())
  );
  const idx = snaps.findIndex((snap) => snap.exists);
  return idx === -1 ? null : entries[idx][0];
}

// Lets a Basic profile ask for Premium from its own app. Doesn't grant it —
// only flags subscriptions/{uid}.upgradeRequestedAt so the admin dashboard's
// "Solicitudes de upgrade" section can surface it; the actual plan change
// still only ever happens through the isSupport()-gated dashboard write.
export const requestPremiumUpgrade = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const subRef = admin.firestore().collection('subscriptions').doc(request.auth.uid);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    const profileType = await resolveProfileType(request.auth.uid);
    if (!profileType) {
      throw new HttpsError('not-found', 'No se encontró tu perfil.');
    }
    // No subscription doc means this profile predates the onXCreated
    // trigger — it's already Premium by policy, so back the doc into
    // existence and tell the caller there's nothing to request.
    const nowIso = new Date().toISOString();
    await subRef.set({
      profileType, plan: 'premium', weekCount: 0, weekStart: nowIso,
      createdAt: nowIso, updatedAt: nowIso,
    });
    throw new HttpsError('failed-precondition', 'Ya tienes el plan Premium.');
  }
  if (subSnap.data()?.plan === 'premium') {
    throw new HttpsError('failed-precondition', 'Ya tienes el plan Premium.');
  }
  await subRef.update({ upgradeRequestedAt: new Date().toISOString() });
  return { success: true };
});

// Lets a Premium profile opt itself back down to Basic from its own app —
// unlike requestPremiumUpgrade this applies immediately, no admin approval
// needed, since a profile lowering its own privilege can't be abused the
// way self-granting Premium could. Resets the weekly counter so the
// profile doesn't inherit a stale weekCount from whenever it was last on
// Basic.
export const downgradeToBasic = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  const subRef = admin.firestore().collection('subscriptions').doc(request.auth.uid);
  const subSnap = await subRef.get();
  const nowIso = new Date().toISOString();
  if (!subSnap.exists) {
    // No subscription doc means this profile predates the onXCreated
    // trigger — back it into existence directly on 'basic' instead of
    // failing, since that's the plan the caller is asking for anyway.
    const profileType = await resolveProfileType(request.auth.uid);
    if (!profileType) {
      throw new HttpsError('not-found', 'No se encontró tu perfil.');
    }
    await subRef.set({
      profileType, plan: 'basic', weekCount: 0, weekStart: nowIso,
      createdAt: nowIso, updatedAt: nowIso,
    });
    return { success: true };
  }
  if (subSnap.data()?.plan === 'basic') {
    throw new HttpsError('failed-precondition', 'Ya tienes el plan Basic.');
  }
  await subRef.update({
    plan: 'basic', weekCount: 0, weekStart: nowIso, updatedAt: nowIso,
    upgradeRequestedAt: admin.firestore.FieldValue.delete(),
  });
  return { success: true };
});
