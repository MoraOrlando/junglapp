import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLost, setIsLost] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.PETS, id)).then((snap) => {
      if (snap.exists()) setPet({ id: snap.id, ...snap.data() } as Pet);
      setLoading(false);
    });
    // Check if already reported lost
    getDocs(query(
      collection(db, COLLECTIONS.LOST_PETS),
      where('petId', '==', id),
      where('isFound', '==', false)
    )).then((snap) => setIsLost(!snap.empty));
  }, [id]);

  async function toggleLookingForPartner() {
    if (!pet || !id) return;
    const newValue = !pet.lookingForPartner;
    await updateDoc(doc(db, COLLECTIONS.PETS, id), { lookingForPartner: newValue });
    setPet({ ...pet, lookingForPartner: newValue });
  }

  function handleLostReport() {
    if (isLost) {
      Alert.alert(
        '🔍 Ya reportada',
        `${pet?.name} ya está publicada como extraviada. ¿Deseas cancelar el reporte?`,
        [
          { text: 'Mantener reporte', style: 'cancel' },
          {
            text: 'Cancelar reporte', style: 'destructive',
            onPress: async () => {
              // Mark as found internally (cancel report)
              const snap = await getDocs(query(
                collection(db, COLLECTIONS.LOST_PETS),
                where('petId', '==', id),
                where('isFound', '==', false)
              ));
              for (const d of snap.docs) {
                await updateDoc(doc(db, COLLECTIONS.LOST_PETS, d.id), { isFound: true });
              }
              setIsLost(false);
            },
          },
        ]
      );
    } else {
      router.push(`/(owner)/lost/report?petId=${id}` as any);
    }
  }

  if (loading) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando...</Text>
    </SafeAreaView>
  );

  if (!pet) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Mascota no encontrada</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1">
        {/* Header */}
        <View className={`h-48 items-center justify-center ${isLost ? 'bg-red-400' : 'bg-primary-500'}`}>
          <Text className="text-8xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
          {isLost && (
            <View className="absolute bottom-4 bg-red-600 px-4 py-1.5 rounded-full">
              <Text className="text-white text-xs font-bold">🔍 EXTRAVIADA — Publicada</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          className="absolute top-10 left-4 bg-white/80 rounded-full p-2"
          onPress={() => router.back()}
        >
          <Text className="text-primary-700 text-base px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-6">
          {/* Name card */}
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <View className="flex-row justify-between items-start">
              <View>
                <Text className="text-3xl font-bold text-gray-800">{pet.name}</Text>
                <Text className="text-gray-500 mt-1">{pet.breed} · {pet.color}</Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-gray-500">Busca pareja</Text>
                  <Switch
                    value={pet.lookingForPartner}
                    onValueChange={toggleLookingForPartner}
                    trackColor={{ false: '#D1D5DB', true: '#52B788' }}
                    thumbColor={pet.lookingForPartner ? '#2D6A4F' : '#F3F4F6'}
                  />
                </View>
                {pet.lookingForPartner && (
                  <Text className="text-pink-500 text-xs mt-1">💕 En Match</Text>
                )}
              </View>
            </View>
          </View>

          {/* Lost pet action button */}
          <TouchableOpacity
            className={`rounded-2xl py-4 px-5 mb-4 flex-row items-center gap-3 ${isLost ? 'bg-red-50 border-2 border-red-300' : 'bg-orange-50 border-2 border-orange-200'}`}
            onPress={handleLostReport}
          >
            <Text className="text-3xl">{isLost ? '🔍' : '🚨'}</Text>
            <View className="flex-1">
              <Text className={`font-bold text-base ${isLost ? 'text-red-600' : 'text-orange-600'}`}>
                {isLost ? 'Extraviada — Publicada' : 'Reportar como Extraviada'}
              </Text>
              <Text className={`text-xs mt-0.5 ${isLost ? 'text-red-400' : 'text-orange-400'}`}>
                {isLost ? 'Toca para cancelar el reporte' : 'Notifica a usuarios cercanos'}
              </Text>
            </View>
            <Text className={isLost ? 'text-red-400' : 'text-orange-400'}>›</Text>
          </TouchableOpacity>

          {/* Info grid */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">Nacimiento</Text>
              <Text className="font-semibold text-gray-800 mt-1">{pet.birthDate}</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">En familia desde</Text>
              <Text className="font-semibold text-gray-800 mt-1">{pet.familyDate}</Text>
            </View>
          </View>

          {pet.chipNumber && (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs">Número de Chip</Text>
              <Text className="font-semibold text-gray-800 mt-1 font-mono">{pet.chipNumber}</Text>
            </View>
          )}

          {pet.description && (
            <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs mb-1">Descripción</Text>
              <Text className="text-gray-700">{pet.description}</Text>
            </View>
          )}

          {/* Medical record */}
          <Text className="text-gray-700 font-semibold text-base mb-3">Ficha Médica 🏥</Text>
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-400 text-xs mb-2">Vacunas</Text>
            {pet.medicalRecord.vaccinations.length === 0 ? (
              <Text className="text-gray-400 text-sm">Sin vacunas registradas</Text>
            ) : (
              pet.medicalRecord.vaccinations.map((v, i) => (
                <View key={i} className="flex-row justify-between py-1 border-b border-gray-50">
                  <Text className="text-gray-700">{v.name}</Text>
                  <Text className="text-gray-400 text-sm">{v.date}</Text>
                </View>
              ))
            )}
          </View>

          {pet.medicalRecord.allergies.length > 0 && (
            <View className="bg-red-50 rounded-2xl p-4 mb-4 border border-red-100">
              <Text className="text-red-500 text-xs mb-2 font-medium">⚠️ Alergias</Text>
              <Text className="text-red-700">{pet.medicalRecord.allergies.join(', ')}</Text>
            </View>
          )}

          {pet.medicalRecord.conditions.length > 0 && (
            <View className="bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-100">
              <Text className="text-amber-600 text-xs mb-2 font-medium">📋 Condiciones</Text>
              <Text className="text-amber-700">{pet.medicalRecord.conditions.join(', ')}</Text>
            </View>
          )}

          {pet.medicalRecord.notes && (
            <View className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs mb-1">Notas médicas</Text>
              <Text className="text-gray-700">{pet.medicalRecord.notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
