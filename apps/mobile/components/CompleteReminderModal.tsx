import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import type { Reminder } from '@junglapp/types';
import { getVisitSection, SECTION_META } from '../lib/visitReasons';
import { completeReminder, dismissReminder } from '../lib/reminders';
import YearCalendar from './YearCalendar';

interface Props {
  visible: boolean;
  reminder: Reminder | null;
  petName: string;
  onClose: () => void;
  onCompleted: () => void;
}

// Compartido entre la home (banner de recordatorios) y la ficha médica de la
// mascota — un solo flujo para "marcar como realizada" o "descartar" un
// reminder de vacuna/antiparasitario/control, sin navegar a otra pantalla.
export default function CompleteReminderModal({ visible, reminder, petName, onClose, onCompleted }: Props) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [nextDueDate, setNextDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setPhotoUri(null);
      setShowCalendar(false);
      setNextDueDate('');
      setSaving(false);
    }
  }, [visible, reminder?.id]);

  if (!reminder) return null;

  const section = getVisitSection(reminder.visitReason);
  const meta = SECTION_META[section];
  const isOverdue = reminder.date < new Date().toISOString().split('T')[0];

  function pickPhoto() {
    Alert.alert('Comprobante', '¿Cómo quieres agregar la foto?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      {
        text: 'Galería', onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
          if (!result.canceled) setPhotoUri(result.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function handleComplete() {
    setSaving(true);
    try {
      await completeReminder({ reminder: reminder!, photoUri, nextDueDate: nextDueDate || null });
      onCompleted();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDismiss() {
    Alert.alert('Descartar recordatorio', '¿Seguro que quieres descartar este recordatorio sin registrar una visita?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar', style: 'destructive', onPress: async () => {
          setSaving(true);
          try {
            await dismissReminder(reminder!.id);
            onCompleted();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B' }}>
              {meta.emoji} {meta.title}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ backgroundColor: isOverdue ? '#FEF2F2' : '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: isOverdue ? '#FECACA' : '#FDE68A' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: isOverdue ? '#DC2626' : '#92400E' }}>
                {petName} — {reminder.date}
              </Text>
              <Text style={{ fontSize: 12, color: isOverdue ? '#EF4444' : '#B45309', marginTop: 2 }}>
                {isOverdue ? 'Pendiente desde esta fecha' : 'Próxima fecha programada'}
              </Text>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
              Foto de comprobante (opcional)
            </Text>
            <TouchableOpacity
              onPress={pickPhoto}
              style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: '#86EFAC', borderRadius: 16, height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4', overflow: 'hidden', marginBottom: 20 }}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>📷</Text>
                  <Text style={{ color: '#16A34A', fontSize: 13, fontWeight: '600' }}>Subir foto</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 }}>
              Próxima fecha (opcional)
            </Text>
            <TouchableOpacity
              onPress={() => setShowCalendar((v) => !v)}
              style={{ borderWidth: 1, borderColor: nextDueDate ? '#2D6A4F' : '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginBottom: showCalendar ? 8 : 20 }}
            >
              <Text style={{ fontSize: 18 }}>📅</Text>
              <Text style={{ color: nextDueDate ? '#1E293B' : '#9CA3AF', fontWeight: nextDueDate ? '600' : '400' }}>
                {nextDueDate || 'Seleccionar fecha'}
              </Text>
              {nextDueDate ? (
                <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => setNextDueDate('')}>
                  <Text style={{ color: '#9CA3AF' }}>✕</Text>
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>

            {showCalendar && (
              <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20 }}>
                <YearCalendar
                  onDayPress={(day: { dateString: string }) => { setNextDueDate(day.dateString); setShowCalendar(false); }}
                  minDate={new Date().toISOString().split('T')[0]}
                  markedDates={nextDueDate ? { [nextDueDate]: { selected: true, selectedColor: '#2D6A4F' } } : {}}
                />
              </View>
            )}

            <TouchableOpacity
              onPress={handleComplete}
              disabled={saving}
              style={{ backgroundColor: saving ? '#9CA3AF' : '#2D6A4F', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                {saving ? 'Guardando...' : '✅ Marcar como realizada'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDismiss} disabled={saving} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#EF4444', fontWeight: '600', fontSize: 14 }}>Descartar recordatorio</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
