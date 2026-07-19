import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { randomInt, randomUUID } from 'crypto';
import { Expo } from 'expo-server-sdk';

admin.initializeApp();

// CSPRNG-based password generator (replaces Math.random)
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[randomInt(chars.length)];
  }
  return password;
}

function createTransporter() {
  const config = functions.config();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.email?.user || process.env.EMAIL_USER,
      pass: config.email?.pass || process.env.EMAIL_PASS,
    },
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const sendTempPassword = functions.https.onCall(async (data, context) => {
  const { email } = data;

  // Input validation — length cap prevents ReDoS against the regex
  if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'Correo inválido.');
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
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"JunglApp" <${functions.config().email?.user || process.env.EMAIL_USER}>`,
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
export const uploadUserImage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión para subir archivos.');
  }

  const { base64, ext, contentType } = data as { base64?: string; ext?: string; contentType?: string };
  if (!base64 || typeof base64 !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Falta el contenido de la imagen.');
  }

  const resolvedExt = ALLOWED_IMAGE_EXTENSIONS.includes((ext || '').toLowerCase())
    ? (ext as string).toLowerCase()
    : 'jpg';
  const resolvedContentType = contentType || IMAGE_MIME_TYPES[resolvedExt];

  if (!BASE64_REGEX.test(base64)) {
    // Buffer.from(str, 'base64') silently drops invalid characters instead of
    // throwing, so this regex check is the only thing that actually catches
    // malformed input.
    throw new functions.https.HttpsError('invalid-argument', 'Contenido de imagen inválido.');
  }
  // Reject oversized payloads from their base64 string length (cheap) before
  // paying the cost of decoding into a buffer.
  const approxDecodedBytes = (base64.length * 3) / 4;
  if (approxDecodedBytes > MAX_UPLOAD_BYTES) {
    throw new functions.https.HttpsError('invalid-argument', `La imagen no debe superar los ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
    throw new functions.https.HttpsError('invalid-argument', `La imagen no debe superar los ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
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
export const onAppointmentCreated = functions.firestore
  .document('appointments/{appointmentId}')
  .onCreate(async (snap) => {
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
export const onAppointmentUpdated = functions.firestore
  .document('appointments/{appointmentId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
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

// Descuenta stock cuando la tienda confirma un pedido — no al crearlo, para
// no tocar inventario por pedidos que terminan siendo rechazados.
export const onOrderConfirmed = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
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

// Notifica al destinatario cuando llega un mensaje de chat
export const onChatMessageCreated = functions.database
  .ref('messages/{chatId}/{messageId}')
  .onCreate(async (snap, context) => {
    const message = snap.val();
    const { senderId, senderName, text, imageUrl } = message;
    const { chatId } = context.params;

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
  });

// Recalculate trainer/vet rating server-side when a review is created.
// Prevents client-side rating manipulation.
export const onReviewCreated = functions.firestore
  .document('reviews/{reviewId}')
  .onCreate(async (snap) => {
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
export const onPlaceReviewCreated = functions.firestore
  .document('placeReviews/{reviewId}')
  .onCreate(async (snap) => {
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
export const onReportCreated = functions.firestore
  .document('reports/{reportId}')
  .onCreate(async (snap) => {
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

    const config = functions.config();
    const adminEmail = config.email?.admin || config.email?.user || process.env.EMAIL_USER;
    if (!adminEmail) return;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"JunglApp" <${config.email?.user || process.env.EMAIL_USER}>`,
      to: adminEmail,
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
