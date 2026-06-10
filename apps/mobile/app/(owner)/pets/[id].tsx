import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Animated, Modal
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs
} from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

interface VisitEntry {
  id: string;
  date: string;
  vetName: string;
  source: 'owner' | 'vet';
  notes?: string;
  diagnosis?: string;
  treatment?: string;
  prescriptionUrl?: string | null;
  nextControlDate?: string | null;
}

export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pet, setPet] = useState<Pet | null>(null);
  const [visits, setVisits] = useState<VisitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLost, setIsLost] = useState(false);
  const [showFlame, setShowFlame] = useState(false);

  const flameScale = useRef(new Animated.Value(0)).current;
  const flameOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.PETS, id)).then((snap) => {
      if (snap.exists()) setPet({ id: snap.id, ...snap.data() } as Pet);
      setLoading(false);
    });
    // Filter isFound in JS to avoid requiring a composite Firestore index
    getDocs(query(
      collection(db, COLLECTIONS.LOST_PETS),
      where('petId', '==', id)
    )).then((snap) => {
      setIsLost(snap.docs.some((d) => d.data().isFound === false));
    });

    // Visit history: owner-registered visits + vet-completed in-app consultations
    Promise.all([
      getDocs(query(collection(db, COLLECTIONS.MEDICAL_VISITS), where('petId', '==', id))),
      getDocs(query(collection(db, COLLECTIONS.APPOINTMENTS), where('petId', '==', id))),
    ]).then(([visitsSnap, apptsSnap]) => {
      const ownerVisits: VisitEntry[] = visitsSnap.docs.map((d) => {
        const v = d.data();
        return {
          id: d.id, source: 'owner',
          date: v.date ?? '', vetName: v.vetName ?? 'Veterinario',
          notes: v.notes, prescriptionUrl: v.prescriptionUrl,
          nextControlDate: v.nextControlDate,
        };
      });
      // Vet flow: only appointments the vet already completed are visible in the history
      const vetVisits: VisitEntry[] = apptsSnap.docs
        .filter((d) => d.data().status === 'completed' && d.data().consultation)
        .map((d) => {
          const a = d.data();
          return {
            id: d.id, source: 'vet',
            date: a.date ?? '', vetName: a.vetName ?? 'Veterinario JunglApp',
            diagnosis: a.consultation?.diagnosis,
            treatment: a.consultation?.treatmentDone || a.consultation?.treatment,
            prescriptionUrl: a.consultation?.prescriptionImageUrl,
          };
        });
      setVisits([...ownerVisits, ...vetVisits].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')));
    });
  }, [id]);

  function triggerFlameAndNavigate() {
    setShowFlame(true);
    flameScale.setValue(0);
    flameOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(flameScale, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.timing(flameOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
      Animated.delay(700),
      Animated.timing(flameOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      setShowFlame(false);
      router.push(`/(owner)/pets/match-profile?petId=${id}` as any);
    });
  }

  async function handleHeartPress() {
    if (!pet || !id) return;
    if (pet.lookingForPartner) {
      // Already active — ask to deactivate
      Alert.alert(
        '💔 Dejar de buscar pareja',
        `¿Deseas que ${pet.name} deje de aparecer en Match?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sí, desactivar',
            style: 'destructive',
            onPress: async () => {
              await updateDoc(doc(db, COLLECTIONS.PETS, id), { lookingForPartner: false });
              setPet({ ...pet, lookingForPartner: false });
            },
          },
        ]
      );
    } else {
      await updateDoc(doc(db, COLLECTIONS.PETS, id), { lookingForPartner: true });
      setPet({ ...pet, lookingForPartner: true });
      triggerFlameAndNavigate();
    }
  }

  function handleLostReport() {
    if (isLost) {
      Alert.alert('🔍 Ya reportada', `${pet?.name} ya está publicada como extraviada. ¿Deseas cancelar el reporte?`, [
        { text: 'Mantener reporte', style: 'cancel' },
        {
          text: 'Cancelar reporte', style: 'destructive',
          onPress: async () => {
            const snap = await getDocs(query(
              collection(db, COLLECTIONS.LOST_PETS),
              where('petId', '==', id)
            ));
            for (const d of snap.docs.filter((d) => !d.data().isFound)) {
              await updateDoc(doc(db, COLLECTIONS.LOST_PETS, d.id), { isFound: true });
            }
            setIsLost(false);
          },
        },
      ]);
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
      {/* Flame overlay */}
      <Modal transparent visible={showFlame} animationType="none">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text style={{
            fontSize: 120,
            transform: [{ scale: Animated.multiply(flameScale, new Animated.Value(1.5)) }],
            opacity: flameOpacity,
          }}>
            🔥
          </Animated.Text>
          <Animated.Text style={{ fontSize: 22, color: '#fff', fontWeight: 'bold', marginTop: 12, opacity: flameOpacity }}>
            ¡A buscar pareja!
          </Animated.Text>
        </View>
      </Modal>

      <ScrollView className="flex-1">
        {/* Header photo */}
        <View className={`h-64 items-center justify-center ${isLost ? 'bg-red-400' : 'bg-primary-500'}`}>
          {pet.photos && pet.photos.length > 0 ? (
            <Image source={{ uri: pet.photos[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <Text className="text-8xl">{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
          )}
          {isLost && (
            <View className="absolute bottom-4 bg-red-600 px-4 py-1.5 rounded-full">
              <Text className="text-white text-xs font-bold">🔍 EXTRAVIADA — Publicada</Text>
            </View>
          )}
        </View>

        <TouchableOpacity className="absolute top-10 left-4 bg-white/80 rounded-full p-2" onPress={() => router.back()}>
          <Text className="text-primary-700 text-base px-1">←</Text>
        </TouchableOpacity>

        <View className="px-6 -mt-6">
          {/* Name card */}
          <View className="bg-white rounded-2xl p-5 shadow-md mb-4">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 mr-4">
                <Text className="text-3xl font-bold text-gray-800">{pet.name}</Text>
                <Text className="text-gray-500 mt-1">{pet.breed} · {pet.color}</Text>
              </View>
              {/* Heart / Match button */}
              <TouchableOpacity
                style={{
                  borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center',
                  backgroundColor: pet.lookingForPartner ? '#fdf2f8' : '#f9fafb',
                  borderWidth: 2,
                  borderColor: pet.lookingForPartner ? '#f9a8d4' : '#e5e7eb',
                }}
                onPress={handleHeartPress}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 30 }}>{pet.lookingForPartner ? '❤️' : '🤍'}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', marginTop: 4, color: pet.lookingForPartner ? '#ec4899' : '#9ca3af' }}>
                  {pet.lookingForPartner ? 'En Match' : 'Buscar pareja'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Photo gallery */}
          {pet.photos && pet.photos.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <View className="flex-row gap-2">
                {pet.photos.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={{ width: 80, height: 80, borderRadius: 12 }} contentFit="cover" />
                ))}
              </View>
            </ScrollView>
          )}

          {/* Lost report button */}
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
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-700 font-semibold text-base">Ficha Médica 🏥</Text>
            <TouchableOpacity
              className="bg-primary-500 rounded-xl px-4 py-2"
              onPress={() => router.push(`/(owner)/pets/add-visit?petId=${id}` as any)}
            >
              <Text className="text-white text-xs font-semibold">+ Registrar visita</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-400 text-xs mb-2">Vacunas</Text>
            {(pet.medicalRecord?.vaccinations ?? []).length === 0 ? (
              <View className="items-center py-4">
                <Text className="text-gray-300 text-4xl mb-2">💉</Text>
                <Text className="text-gray-400 text-sm">Sin vacunas registradas</Text>
                <TouchableOpacity
                  className="mt-3 border border-primary-300 rounded-xl px-4 py-2"
                  onPress={() => router.push(`/(owner)/pets/add-visit?petId=${id}` as any)}
                >
                  <Text className="text-primary-600 text-xs font-medium">Registrar primera visita</Text>
                </TouchableOpacity>
              </View>
            ) : (
              (pet.medicalRecord?.vaccinations ?? []).map((v, i) => (
                <View key={i} className="flex-row justify-between py-1 border-b border-gray-50">
                  <Text className="text-gray-700">{v.name}</Text>
                  <Text className="text-gray-400 text-sm">{v.date}</Text>
                </View>
              ))
            )}
          </View>

          {(pet.medicalRecord?.allergies ?? []).length > 0 && (
            <View className="bg-red-50 rounded-2xl p-4 mb-4 border border-red-100">
              <Text className="text-red-500 text-xs mb-2 font-medium">⚠️ Alergias</Text>
              <Text className="text-red-700">{(pet.medicalRecord?.allergies ?? []).join(', ')}</Text>
            </View>
          )}

          {(pet.medicalRecord?.conditions ?? []).length > 0 && (
            <View className="bg-amber-50 rounded-2xl p-4 mb-4 border border-amber-100">
              <Text className="text-amber-600 text-xs mb-2 font-medium">📋 Condiciones</Text>
              <Text className="text-amber-700">{(pet.medicalRecord?.conditions ?? []).join(', ')}</Text>
            </View>
          )}

          {/* Visit history */}
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
            <Text className="text-gray-400 text-xs mb-2">Historial de visitas</Text>
            {visits.length === 0 ? (
              <Text className="text-gray-400 text-sm text-center py-3">Sin visitas registradas aún</Text>
            ) : (
              visits.map((v) => (
                <View key={`${v.source}-${v.id}`} className="py-2.5 border-b border-gray-50">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-semibold text-gray-800 text-sm">🩺 {v.vetName}</Text>
                    <Text className="text-gray-400 text-xs">{v.date}</Text>
                  </View>
                  <Text className={`text-xs mt-0.5 ${v.source === 'vet' ? 'text-blue-500' : 'text-gray-400'}`}>
                    {v.source === 'vet' ? 'Consulta agendada vía JunglApp ✓' : 'Registrada por ti'}
                  </Text>
                  {v.diagnosis ? <Text className="text-gray-600 text-xs mt-1">Diagnóstico: {v.diagnosis}</Text> : null}
                  {v.treatment ? <Text className="text-gray-600 text-xs mt-0.5">Tratamiento: {v.treatment}</Text> : null}
                  {v.notes ? <Text className="text-gray-600 text-xs mt-1">{v.notes}</Text> : null}
                  {v.nextControlDate ? <Text className="text-amber-600 text-xs mt-1">📅 Próximo control: {v.nextControlDate}</Text> : null}
                </View>
              ))
            )}
          </View>

          {pet.medicalRecord?.notes && (
            <View className="bg-white rounded-2xl p-4 mb-6 shadow-sm border border-gray-100">
              <Text className="text-gray-400 text-xs mb-1">Notas médicas</Text>
              <Text className="text-gray-700">{pet.medicalRecord.notes}</Text>
            </View>
          )}

          <View className="h-8" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
