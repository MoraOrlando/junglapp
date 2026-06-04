import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, RTDB_PATHS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Appointment, Pet, Veterinarian } from '@junglapp/types';

const { db, rtdb } = initFirebase();

const PRIMARY = '#1D4ED8';
const GREEN = '#16A34A';
const BORDER = '#E2E8F0';
const DARK = '#1E293B';
const GRAY = '#64748B';
const inputStyle = {
  borderWidth: 1, borderColor: BORDER, borderRadius: 12,
  backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12,
  fontSize: 15, color: DARK, textAlignVertical: 'top' as const,
};

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [vetProfile, setVetProfile] = useState<Veterinarian | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [arriving, setArriving] = useState(false);

  // Consultation fields
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentDone, setTreatmentDone] = useState('');
  const [treatmentPending, setTreatmentPending] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [prescription, setPrescription] = useState('');
  const [prescriptionUri, setPrescriptionUri] = useState<string | null>(null);
  const [prescriptionUrl, setPrescriptionUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    loadAll();
  }, [id, user]);

  async function loadAll() {
    setLoading(true);
    try {
      const apptSnap = await getDoc(doc(db, COLLECTIONS.APPOINTMENTS, id!));
      if (!apptSnap.exists()) return;
      const appt = { id: apptSnap.id, ...apptSnap.data() } as Appointment;
      setAppointment(appt);

      if (appt.consultation) {
        setSymptoms((appt.consultation as any).symptoms || '');
        setDiagnosis(appt.consultation.diagnosis || '');
        setTreatmentDone((appt.consultation as any).treatmentDone || appt.consultation.treatment || '');
        setTreatmentPending((appt.consultation as any).treatmentPending || '');
        setCareInstructions(appt.consultation.careInstructions || '');
        setPrescription(appt.consultation.prescription || '');
        setPrescriptionUrl(appt.consultation.prescriptionImageUrl || null);
      }

      const [petSnap, vetSnap] = await Promise.all([
        getDoc(doc(db, COLLECTIONS.PETS, appt.petId)),
        getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user!.uid))),
      ]);
      if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
      if (!vetSnap.empty) setVetProfile({ id: vetSnap.docs[0].id, ...vetSnap.docs[0].data() } as Veterinarian);
    } finally {
      setLoading(false);
    }
  }

  async function markArrived() {
    if (!id || !appointment) return;
    setArriving(true);
    try {
      const now = new Date().toISOString();
      await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), {
        status: 'arrived',
        arrivedAt: now,
      });

      // Write RTDB notification so owner gets a real-time popup
      await set(
        ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${appointment.ownerId}/${id}`),
        {
          type: 'vet_arrived',
          vetName: vetProfile?.name || 'Tu veterinario',
          petId: appointment.petId,
          appointmentId: id,
          arrivedAt: now,
          read: false,
        }
      );

      setAppointment((p) => p ? { ...p, status: 'arrived', arrivedAt: now } : null);
      Alert.alert('📍 Llegada registrada', 'Se notificó al dueño de la mascota. Puedes completar la ficha médica.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setArriving(false);
    }
  }

  async function pickPrescription() {
    Alert.alert('Subir receta', '¿Cómo quieres agregar la imagen?', [
      {
        text: 'Cámara', onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return;
          const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
          if (!r.canceled) setPrescriptionUri(r.assets[0].uri);
        },
      },
      {
        text: 'Galería', onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
          if (!r.canceled) setPrescriptionUri(r.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function saveConsultation() {
    if (!id || !appointment || !pet) return;
    if (!symptoms.trim() || !diagnosis.trim() || !treatmentDone.trim()) {
      Alert.alert('Requerido', 'Completa síntomas, diagnóstico y tratamiento realizado');
      return;
    }
    setSaving(true);
    try {
      let imgUrl = prescriptionUrl;
      if (prescriptionUri) imgUrl = await uploadImage(prescriptionUri);

      const consultation = {
        symptoms: symptoms.trim(),
        diagnosis: diagnosis.trim(),
        treatmentDone: treatmentDone.trim(),
        treatmentPending: treatmentPending.trim(),
        treatment: treatmentDone.trim(), // backward compat
        careInstructions: careInstructions.trim(),
        prescription: prescription.trim(),
        prescriptionImageUrl: imgUrl || null,
        visitDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), {
        status: 'completed',
        consultation,
      });

      // Append to pet medical record notes
      const newNote = `[${new Date().toLocaleDateString('es-CL')}] ${diagnosis.trim()}`;
      const existing = pet.medicalRecord.notes || '';
      await updateDoc(doc(db, COLLECTIONS.PETS, pet.id), {
        'medicalRecord.notes': existing ? `${existing}\n${newNote}` : newNote,
        'medicalRecord.lastUpdated': new Date().toISOString(),
      });

      Alert.alert('✅ Consulta guardada', 'La ficha médica fue actualizada correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </SafeAreaView>
    );
  }

  if (!appointment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: GRAY }}>Cita no encontrada</Text>
      </SafeAreaView>
    );
  }

  const canEdit = appointment.status === 'arrived';
  const isCompleted = appointment.status === 'completed';
  const statusColor = { pending: '#F59E0B', confirmed: '#3B82F6', arrived: '#8B5CF6', completed: '#16A34A', cancelled: '#EF4444' }[appointment.status] ?? GRAY;
  const statusLabel = { pending: '⏳ Pendiente', confirmed: '✅ Confirmada', arrived: '📍 Veterinario llegó', completed: '✔️ Completada', cancelled: '❌ Cancelada' }[appointment.status] ?? appointment.status;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, marginBottom: 20 }}>
            <Text style={{ color: PRIMARY, fontSize: 16 }}>← Volver</Text>
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: '800', color: DARK, marginBottom: 16 }}>
            Detalle de Cita 🩺
          </Text>

          {/* Appointment summary card */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View>
                <Text style={{ color: GRAY, fontSize: 12 }}>Fecha y hora</Text>
                <Text style={{ fontWeight: '700', color: DARK, fontSize: 15 }}>{appointment.date} — {appointment.time}</Text>
              </View>
              <View style={{ backgroundColor: statusColor + '20', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 }}>
                <Text style={{ color: statusColor, fontWeight: '600', fontSize: 12 }}>{statusLabel}</Text>
              </View>
            </View>
            {(appointment as any).reason && (
              <View style={{ backgroundColor: '#F1F5F9', borderRadius: 10, padding: 10, marginTop: 4 }}>
                <Text style={{ color: GRAY, fontSize: 12 }}>Motivo: {(appointment as any).reason}</Text>
              </View>
            )}
          </View>

          {/* MARK ARRIVED */}
          {appointment.status === 'confirmed' && (
            <TouchableOpacity
              style={{
                backgroundColor: arriving ? '#93C5FD' : PRIMARY,
                borderRadius: 16, paddingVertical: 16,
                alignItems: 'center', marginBottom: 16,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
              onPress={markArrived}
              disabled={arriving}
            >
              {arriving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 20 }}>📍</Text>}
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                {arriving ? 'Notificando al dueño...' : 'Marcar como Llegado'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Arrived notice */}
          {appointment.status === 'arrived' && (
            <View style={{ backgroundColor: '#EDE9FE', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#C4B5FD', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>📬</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: '#6D28D9', fontSize: 14 }}>El dueño fue notificado</Text>
                <Text style={{ color: '#7C3AED', fontSize: 12, marginTop: 2 }}>Completa la ficha médica de la mascota</Text>
              </View>
            </View>
          )}

          {/* PET CARD */}
          {pet && (canEdit || isCompleted) && (
            <>
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 16, marginBottom: 10 }}>
                Ficha de {pet.name} 📋
              </Text>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: BORDER }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {pet.photos?.[0] ? (
                    <Image source={{ uri: pet.photos[0] }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 32 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: DARK, fontSize: 18 }}>{pet.name}</Text>
                    <Text style={{ color: GRAY, fontSize: 13 }}>{pet.breed} · {pet.color}</Text>
                    <Text style={{ color: GRAY, fontSize: 12 }}>Nacimiento: {pet.birthDate}</Text>
                    {pet.chipNumber ? <Text style={{ color: GRAY, fontSize: 12 }}>Chip: {pet.chipNumber}</Text> : null}
                  </View>
                </View>

                {pet.medicalRecord.allergies.length > 0 && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FECACA', marginBottom: 8 }}>
                    <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>
                      ⚠️ Alergias: {pet.medicalRecord.allergies.join(', ')}
                    </Text>
                  </View>
                )}

                {pet.medicalRecord.vaccinations.length > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: GRAY, fontSize: 12, marginBottom: 4, fontWeight: '600' }}>Vacunas:</Text>
                    {pet.medicalRecord.vaccinations.map((v, i) => (
                      <Text key={i} style={{ color: DARK, fontSize: 13 }}>• {v.name} — {v.date}</Text>
                    ))}
                  </View>
                )}

                {pet.medicalRecord.notes ? (
                  <View>
                    <Text style={{ color: GRAY, fontSize: 12, marginBottom: 4, fontWeight: '600' }}>Historial médico:</Text>
                    <Text style={{ color: DARK, fontSize: 13, lineHeight: 20 }}>{pet.medicalRecord.notes}</Text>
                  </View>
                ) : null}
              </View>

              {/* CONSULTATION FORM */}
              <Text style={{ fontWeight: '700', color: DARK, fontSize: 16, marginBottom: 12 }}>
                Registro de Consulta
              </Text>

              {[
                { label: 'Síntomas observados *', value: symptoms, set: setSymptoms, placeholder: 'Describe los síntomas que presenta la mascota...' },
                { label: 'Diagnóstico *', value: diagnosis, set: setDiagnosis, placeholder: 'Diagnóstico clínico...' },
                { label: 'Tratamiento realizado *', value: treatmentDone, set: setTreatmentDone, placeholder: 'Procedimientos y tratamientos realizados en la consulta...' },
                { label: 'Tratamiento a realizar', value: treatmentPending, set: setTreatmentPending, placeholder: 'Indicaciones para continuar en casa o próximas visitas...' },
                { label: 'Instrucciones de cuidado', value: careInstructions, set: setCareInstructions, placeholder: 'Instrucciones específicas para el dueño...' },
                { label: 'Receta (texto)', value: prescription, set: setPrescription, placeholder: 'Medicamentos, dosis y duración...' },
              ].map((f) => (
                <View key={f.label} style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>{f.label}</Text>
                  <TextInput
                    style={{ ...inputStyle, minHeight: 80 }}
                    placeholder={f.placeholder}
                    placeholderTextColor="#94A3B8"
                    value={f.value}
                    onChangeText={f.set}
                    multiline
                    editable={!isCompleted}
                  />
                </View>
              ))}

              {/* Prescription photo */}
              <View style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Foto de receta</Text>
                <TouchableOpacity
                  style={{
                    borderWidth: 2, borderStyle: 'dashed', borderColor: prescriptionUri || prescriptionUrl ? GREEN : '#93C5FD',
                    borderRadius: 16, paddingVertical: 20, alignItems: 'center',
                    backgroundColor: prescriptionUri || prescriptionUrl ? '#F0FDF4' : '#EFF6FF',
                  }}
                  onPress={pickPrescription}
                  disabled={isCompleted}
                >
                  {prescriptionUri ? (
                    <Image source={{ uri: prescriptionUri }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                  ) : prescriptionUrl ? (
                    <Image source={{ uri: prescriptionUrl }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 32, marginBottom: 6 }}>📄</Text>
                      <Text style={{ color: PRIMARY, fontWeight: '600', fontSize: 14 }}>Subir foto de receta</Text>
                      <Text style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>Cámara o galería</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {!isCompleted && (
                <TouchableOpacity
                  style={{
                    backgroundColor: saving ? '#93C5FD' : PRIMARY,
                    borderRadius: 16, paddingVertical: 16,
                    alignItems: 'center', marginBottom: 40,
                    flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}
                  onPress={saveConsultation}
                  disabled={saving}
                >
                  {saving && <ActivityIndicator color="#fff" size="small" />}
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                    {saving ? 'Guardando...' : '💾 Completar y Guardar Consulta'}
                  </Text>
                </TouchableOpacity>
              )}

              {isCompleted && (
                <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 40, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 4 }}>✅</Text>
                  <Text style={{ fontWeight: '700', color: GREEN, fontSize: 15 }}>Consulta completada</Text>
                  <Text style={{ color: GRAY, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                    La ficha médica de {pet.name} fue actualizada
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Pending/not arrived yet */}
          {!canEdit && !isCompleted && appointment.status !== 'confirmed' && appointment.status !== 'arrived' && (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>⏳</Text>
              <Text style={{ fontWeight: '600', color: '#92400E', fontSize: 15, textAlign: 'center' }}>
                Confirma la cita para poder marcar llegada y completar la ficha
              </Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
