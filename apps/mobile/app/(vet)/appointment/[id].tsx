import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Appointment, Pet } from '@junglapp/types';

const { db, storage } = initFirebase();

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [prescription, setPrescription] = useState('');
  const [prescriptionImageUri, setPrescriptionImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.APPOINTMENTS, id)).then(async (snap) => {
      if (snap.exists()) {
        const appt = { id: snap.id, ...snap.data() } as Appointment;
        setAppointment(appt);
        if (appt.consultation) {
          setDiagnosis(appt.consultation.diagnosis);
          setTreatment(appt.consultation.treatment);
          setCareInstructions(appt.consultation.careInstructions);
          setPrescription(appt.consultation.prescription || '');
        }
        const petSnap = await getDoc(doc(db, COLLECTIONS.PETS, appt.petId));
        if (petSnap.exists()) setPet({ id: petSnap.id, ...petSnap.data() } as Pet);
      }
    });
  }, [id]);

  async function markArrived() {
    if (!id) return;
    await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), {
      status: 'arrived',
      arrivedAt: new Date().toISOString(),
    });
    setAppointment((prev) => prev ? { ...prev, status: 'arrived', arrivedAt: new Date().toISOString() } : null);
    Alert.alert('✅', 'Paciente marcado como llegado. Puedes ver la ficha médica.');
  }

  async function pickPrescriptionImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setPrescriptionImageUri(result.assets[0].uri);
  }

  async function saveConsultation() {
    if (!id || !appointment) return;
    if (!diagnosis || !treatment) {
      Alert.alert('Requerido', 'Completa diagnóstico y tratamiento');
      return;
    }
    setSaving(true);
    try {
      let prescriptionImageUrl: string | undefined;
      if (prescriptionImageUri && user) {
        const imgRef = ref(storage, `prescriptions/${user.uid}/${id}/recipe`);
        const response = await fetch(prescriptionImageUri);
        const blob = await response.blob();
        await uploadBytes(imgRef, blob);
        prescriptionImageUrl = await getDownloadURL(imgRef);
      }

      const consultation = {
        diagnosis,
        treatment,
        careInstructions,
        prescription,
        prescriptionImageUrl,
        createdAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, COLLECTIONS.APPOINTMENTS, id), {
        status: 'completed',
        consultation,
      });

      // Update pet medical record with new notes
      if (pet) {
        await updateDoc(doc(db, COLLECTIONS.PETS, pet.id), {
          'medicalRecord.notes': `${pet.medicalRecord.notes}\n[${new Date().toLocaleDateString('es-CL')}] ${diagnosis}`,
          'medicalRecord.lastUpdated': new Date().toISOString(),
        });
      }

      Alert.alert('✅ Consulta guardada', 'La ficha médica fue actualizada.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!appointment) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  const canEdit = appointment.status === 'arrived' || appointment.status === 'completed';

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView className="flex-1 px-6">
          <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-4">
            <Text className="text-blue-500 text-base">← Volver</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-bold text-gray-800 mb-4">Detalle de Cita 🩺</Text>

          {/* Appointment info */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-gray-500 text-sm">Fecha y hora</Text>
                <Text className="font-semibold text-gray-800">{appointment.date} — {appointment.time}</Text>
              </View>
              <View className={`rounded-full px-3 py-1 ${appointment.status === 'arrived' ? 'bg-blue-100' : appointment.status === 'completed' ? 'bg-green-100' : 'bg-yellow-100'}`}>
                <Text className={`text-xs font-medium ${appointment.status === 'arrived' ? 'text-blue-600' : appointment.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}`}>
                  {appointment.status === 'arrived' ? '🔵 Llegó' : appointment.status === 'completed' ? '✅ Completada' : '⏳ Pendiente'}
                </Text>
              </View>
            </View>
          </View>

          {/* Mark arrived button */}
          {appointment.status === 'confirmed' && (
            <TouchableOpacity
              className="bg-blue-500 rounded-2xl py-4 items-center mb-4"
              onPress={markArrived}
            >
              <Text className="text-white font-semibold text-base">📍 Marcar como Llegado</Text>
            </TouchableOpacity>
          )}

          {/* Pet medical record */}
          {(canEdit || appointment.status === 'arrived') && pet && (
            <>
              <Text className="text-gray-700 font-semibold text-base mb-3">Ficha Médica de {pet.name} 📋</Text>

              <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
                <View className="flex-row gap-3">
                  <View className="bg-primary-100 rounded-xl w-14 h-14 items-center justify-center">
                    <Text className="text-3xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-gray-800 text-lg">{pet.name}</Text>
                    <Text className="text-gray-500 text-sm">{pet.breed} · {pet.color}</Text>
                    {pet.chipNumber && <Text className="text-gray-400 text-xs">Chip: {pet.chipNumber}</Text>}
                  </View>
                </View>

                {pet.medicalRecord.allergies.length > 0 && (
                  <View className="bg-red-50 rounded-xl p-3 mt-3 border border-red-100">
                    <Text className="text-red-500 text-xs font-medium">⚠️ Alergias: {pet.medicalRecord.allergies.join(', ')}</Text>
                  </View>
                )}

                {pet.medicalRecord.vaccinations.length > 0 && (
                  <View className="mt-3">
                    <Text className="text-gray-400 text-xs mb-1">Vacunas registradas:</Text>
                    {pet.medicalRecord.vaccinations.map((v, i) => (
                      <Text key={i} className="text-gray-600 text-sm">• {v.name} — {v.date}</Text>
                    ))}
                  </View>
                )}

                {pet.medicalRecord.notes && (
                  <View className="mt-3">
                    <Text className="text-gray-400 text-xs mb-1">Historial:</Text>
                    <Text className="text-gray-600 text-sm">{pet.medicalRecord.notes}</Text>
                  </View>
                )}
              </View>

              {/* Consultation notes */}
              <Text className="text-gray-700 font-semibold text-base mb-3">Registro de Consulta</Text>

              {[
                { label: 'Diagnóstico *', value: diagnosis, set: setDiagnosis, placeholder: 'Describe el diagnóstico...' },
                { label: 'Tratamiento *', value: treatment, set: setTreatment, placeholder: 'Tratamiento indicado...' },
                { label: 'Cuidados a realizar', value: careInstructions, set: setCareInstructions, placeholder: 'Instrucciones para el dueño...' },
                { label: 'Receta médica (texto)', value: prescription, set: setPrescription, placeholder: 'Medicamentos y dosis...' },
              ].map((field) => (
                <View key={field.label} className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 mb-1">{field.label}</Text>
                  <TextInput
                    className="border border-gray-200 rounded-xl px-4 py-3 bg-white text-base"
                    placeholder={field.placeholder}
                    value={field.value}
                    onChangeText={field.set}
                    multiline
                    numberOfLines={3}
                    editable={appointment.status !== 'completed'}
                  />
                </View>
              ))}

              {/* Prescription image */}
              <TouchableOpacity
                className="border-2 border-dashed border-blue-300 rounded-xl py-5 items-center bg-blue-50 mb-6"
                onPress={pickPrescriptionImage}
                disabled={appointment.status === 'completed'}
              >
                <Text className="text-2xl mb-1">{prescriptionImageUri ? '✅' : '📄'}</Text>
                <Text className="text-blue-600 font-medium">
                  {prescriptionImageUri ? 'Receta cargada' : 'Subir imagen de receta'}
                </Text>
              </TouchableOpacity>

              {appointment.status !== 'completed' && (
                <TouchableOpacity
                  className={`bg-blue-600 rounded-2xl py-4 items-center mb-10 ${saving ? 'opacity-70' : ''}`}
                  onPress={saveConsultation}
                  disabled={saving}
                >
                  <Text className="text-white font-semibold text-base">
                    {saving ? 'Guardando...' : '💾 Guardar Consulta'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
