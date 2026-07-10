import { TouchableOpacity, Text, Alert, ActionSheetIOS, Platform } from 'react-native';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../context/AuthContext';

const { db } = initFirebase();

interface Props {
  otherUserId: string;
  otherUserName: string;
  chatId: string;
  onBlocked?: () => void;
}

// Satisfies Apple App Store Guideline 1.2 (User-Generated Content): every chat
// screen needs a way to report objectionable content and block abusive users.
export function ReportBlockButton({ otherUserId, otherUserName, chatId, onBlocked }: Props) {
  const { user } = useAuth();

  function openMenu() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancelar', 'Reportar contenido', 'Bloquear usuario'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 2,
        },
        (index) => {
          if (index === 1) reportFlow();
          if (index === 2) confirmBlock();
        }
      );
    } else {
      // Alert.prompt (used by reportFlow) has no Android equivalent — only
      // block (a plain Alert) is offered here until an Android-native report
      // input is built.
      Alert.alert('Opciones', undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Bloquear usuario', style: 'destructive', onPress: confirmBlock },
      ]);
    }
  }

  function submitReport(reason: string) {
    if (!reason.trim() || !user) return;
    addDoc(collection(db, COLLECTIONS.REPORTS), {
      reporterId: user.uid,
      reportedUserId: otherUserId,
      reportedUserName: otherUserName,
      chatId,
      reason: reason.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }).then(() => {
      Alert.alert('Gracias', 'Tu reporte fue enviado. Lo revisaremos dentro de 24 horas.');
    }).catch((e: any) => {
      Alert.alert('Error', e.message);
    });
  }

  function reportFlow() {
    Alert.prompt(
      'Reportar contenido',
      `Cuéntanos qué encontraste inapropiado en tu conversación con ${otherUserName}. Revisamos todos los reportes dentro de 24 horas.`,
      (reason) => submitReport(reason ?? '')
    );
  }

  function confirmBlock() {
    Alert.alert(
      'Bloquear usuario',
      `${otherUserName} ya no podrá contactarte y esta conversación desaparecerá de tu lista. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              await setDoc(doc(db, COLLECTIONS.BLOCKS, `${user.uid}_${otherUserId}`), {
                blockerId: user.uid,
                blockedId: otherUserId,
                createdAt: new Date().toISOString(),
              });
              Alert.alert('Bloqueado', `Ya no verás mensajes de ${otherUserName}.`);
              onBlocked?.();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  return (
    <TouchableOpacity onPress={openMenu} style={{ paddingHorizontal: 8, paddingVertical: 4 }} hitSlop={8}>
      <Text style={{ fontSize: 20, color: '#6B7280' }}>⋮</Text>
    </TouchableOpacity>
  );
}
