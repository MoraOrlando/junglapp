import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onValueCreated } from 'firebase-functions/v2/database';
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

  const { base64, ext, contentType } = request.data as { base64?: string; ext?: string; contentType?: string };
  if (!base64 || typeof base64 !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el contenido de la imagen.');
  }

  const resolvedExt = ALLOWED_IMAGE_EXTENSIONS.includes((ext || '').toLowerCase())
    ? (ext as string).toLowerCase()
    : 'jpg';
  const resolvedContentType = contentType || IMAGE_MIME_TYPES[resolvedExt];

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

const expo = new Expo();

async function sendPush(pushToken: string, title: string, body: string) {
  if (!Expo.isExpoPushToken(pushToken)) return;
  await expo.sendPushNotificationsAsync([{ to: pushToken, title, body, sound: 'default' }]);
}

async function getUserPushToken(uid: string): Promise<string | null> {
  const doc = await admin.firestore().collection('users').doc(uid).get();
  return doc.data()?.pushToken ?? null;
}

// Notifica al vet cuando se crea una nueva cita
export const onAppointmentCreated = onDocumentCreated('appointments/{appointmentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const appt = snap.data();
  const { vetId, ownerName, date, time } = appt;
  if (!vetId) return;

  const vetSnap = await admin.firestore().collection('veterinarians').doc(vetId).get();
  const vetUserId = vetSnap.data()?.userId;
  if (!vetUserId) return;

  const token = await getUserPushToken(vetUserId);
  if (!token) return;

  await sendPush(token, 'Nueva reserva', `${ownerName} agendó una cita para el ${date} a las ${time}`);
});

// Notifica al owner cuando cambia el estado de su cita
export const onAppointmentUpdated = onDocumentUpdated('appointments/{appointmentId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

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
        <p><strong>Reportado por:</strong> ${report.reporterId}</p>
        <p><strong>Usuario reportado:</strong> ${report.reportedUserName || report.reportedUserId} (${report.reportedUserId})</p>
        <p><strong>Chat:</strong> ${report.chatId}</p>
        <p><strong>Motivo:</strong> ${report.reason}</p>
        <p style="color: #6B7280; font-size: 13px; margin-top: 24px;">Revisa y actúa dentro de 24 horas desde Firebase Console → Firestore → reports.</p>
      </div>
    `,
  });
});
