import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import { randomInt } from 'crypto';

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

  // Input validation
  if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
    throw new functions.https.HttpsError('invalid-argument', 'Correo inválido.');
  }

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
