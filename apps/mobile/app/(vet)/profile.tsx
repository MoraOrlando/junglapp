import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();

export default function VetProfileScreen() {
  const { user, logOut } = useAuth();
  const [vet, setVet] = useState<Veterinarian | null>(null);
  const [vetDocId, setVetDocId] = useState<string | null>(null);
  const [fee, setFee] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.VETERINARIANS), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const v = { id: snap.docs[0].id, ...snap.docs[0].data() } as Veterinarian;
        setVet(v);
        setVetDocId(snap.docs[0].id);
        setFee(String(v.consultationFee));
        setSpecialties(v.specialties.join(', '));
      }
    });
  }, [user]);

  async function saveProfile() {
    if (!vetDocId) return;
    setSaving(true);
    try {
      const specArr = specialties.split(',').map((s) => s.trim()).filter(Boolean);
      await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, vetDocId), {
        consultationFee: Number(fee),
        specialties: specArr,
      });
      Alert.alert('✅', 'Perfil actualizado');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!vet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando perfil...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6">
        <Text className="text-2xl font-bold text-blue-700 mt-4 mb-6">Mi Perfil 👤</Text>

        <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100 items-center">
          <View className="bg-blue-100 rounded-full w-20 h-20 items-center justify-center mb-3">
            <Text className="text-4xl">🩺</Text>
          </View>
          <Text className="text-xl font-bold text-gray-800">Dr. {user?.name}</Text>
          <Text className="text-gray-500 text-sm">{user?.email}</Text>
          <View className={`rounded-full px-3 py-1 mt-2 ${vet.status === 'approved' ? 'bg-green-100' : vet.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'}`}>
            <Text className={`text-xs font-medium ${vet.status === 'approved' ? 'text-green-600' : vet.status === 'pending' ? 'text-yellow-600' : 'text-red-500'}`}>
              {vet.status === 'approved' ? '✅ Verificado' : vet.status === 'pending' ? '⏳ En revisión' : '❌ Rechazado'}
            </Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <Text className="font-semibold text-gray-700 mb-3">Información</Text>
          {[
            { label: 'RUT', value: vet.rut },
            { label: 'Registro profesional', value: vet.licenseNumber },
            { label: 'Dirección', value: vet.address },
            { label: 'Teléfono', value: vet.phone },
          ].map((item) => (
            <View key={item.label} className="flex-row justify-between py-2 border-b border-gray-50">
              <Text className="text-gray-400 text-sm">{item.label}</Text>
              <Text className="text-gray-700 text-sm font-medium">{item.value}</Text>
            </View>
          ))}
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <Text className="font-semibold text-gray-700 mb-3">Configuración</Text>

          <View className="mb-4">
            <Text className="text-sm text-gray-600 mb-1">Valor consulta (CLP)</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-base"
              value={fee}
              onChangeText={setFee}
              keyboardType="number-pad"
              placeholder="25000"
            />
          </View>

          <View>
            <Text className="text-sm text-gray-600 mb-1">Especialidades (separadas por coma)</Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-base"
              value={specialties}
              onChangeText={setSpecialties}
              placeholder="Cirugía, Dermatología, Oncología"
            />
          </View>
        </View>

        <TouchableOpacity
          className={`bg-blue-600 rounded-2xl py-4 items-center mb-4 ${saving ? 'opacity-70' : ''}`}
          onPress={saveProfile}
          disabled={saving}
        >
          <Text className="text-white font-semibold">{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-red-50 border border-red-200 rounded-2xl py-4 items-center mb-10"
          onPress={logOut}
        >
          <Text className="text-red-500 font-semibold">Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
