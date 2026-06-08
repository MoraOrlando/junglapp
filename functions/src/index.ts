import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';

admin.initializeApp();

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function createTransporter() {
  const config = functions.config();
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: config.email?.user || process.env.EMAIL_USER,
      pass: config.email?.pass || process.env.EMAIL_PASS,
    },
  });
}

export const sendTempPassword = functions.https.onCall(async (data) => {
  const { email } = data;

  if (!email || typeof email !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'El correo es requerido.');
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email.trim().toLowerCase());
  } catch {
    // No revelar si el correo existe o no por seguridad
    return { success: true };
  }

  const tempPassword = generateTempPassword();

  // Actualizar contraseña en Firebase Auth
  await admin.auth().updateUser(userRecord.uid, { password: tempPassword });

  // Marcar que debe cambiar contraseña al ingresar
  await admin.firestore().collection('users').doc(userRecord.uid).update({
    mustChangePassword: true,
    tempPasswordSentAt: new Date().toISOString(),
  });

  // Obtener nombre del usuario
  const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
  const userName = userDoc.data()?.name || 'Usuario';

  // Enviar correo
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"JunglApp" <${functions.config().email?.user || process.env.EMAIL_USER}>`,
    to: email,
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
          <p style="color: #6B7280; font-size: 13px;">⚠️ Al ingresar con esta contraseña, la aplicación te pedirá crear una nueva contraseña de tu elección.</p>
          <p style="color: #6B7280; font-size: 13px;">Si no solicitaste este cambio, ignora este correo — tu cuenta sigue segura.</p>
        </div>
        <p style="text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 16px;">© 2024 JunglApp — La app para el amor por las mascotas</p>
      </div>
    `,
  });

  return { success: true };
});
