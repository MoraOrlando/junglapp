import { sendPasswordResetEmail } from 'firebase/auth';
import { initFirebase } from './config';
import { Alert } from 'react-native';

const { auth } = initFirebase();

export async function handleEmailAlreadyInUse(email: string) {
  return new Promise<void>((resolve) => {
    Alert.alert(
      '📧 Correo ya registrado',
      `El correo ${email} ya tiene una cuenta en JunglApp.\n\n¿Deseas recuperar tu contraseña?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
        {
          text: '🔑 Recuperar contraseña',
          onPress: async () => {
            try {
              await sendPasswordResetEmail(auth, email);
              Alert.alert(
                '✅ Correo enviado',
                `Revisa tu bandeja de entrada en ${email}. Te enviamos un enlace para restablecer tu contraseña.`
              );
            } catch {
              Alert.alert('Error', 'No se pudo enviar el correo de recuperación. Intenta de nuevo.');
            }
            resolve();
          },
        },
      ]
    );
  });
}
