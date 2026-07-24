import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();
const GREEN = '#2D6A4F';

interface LitterAnimal {
  isGift: boolean;
  price: number;
  available: boolean;
  sex?: 'M' | 'F' | null;
  photoUrl?: string | null;
  description?: string;
}

interface Litter {
  id: string;
  parentPetName: string;
  species: string;
  breed: string;
  photos: string[];
  animals: LitterAnimal[];
  isActive: boolean;
}

export default function MyLittersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [litters, setLitters] = useState<Litter[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!user) return;
    try {
      const snap = await getDocs(query(collection(db, COLLECTIONS.LITTERS), where('ownerId', '==', user.uid)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Litter));
      list.sort((a, b) => Number(b.isActive) - Number(a.isActive));
      setLitters(list);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, [user?.uid]));

  // Marking the last available animal as adopted/sold auto-closes the
  // listing (isActive: false) so it drops off the public discovery list;
  // marking any animal available again re-opens it.
  async function toggleAvailable(litter: Litter, index: number) {
    const updatedAnimals = litter.animals.map((a, i) => i === index ? { ...a, available: !a.available } : a);
    const stillHasAvailable = updatedAnimals.some((a) => a.available);
    try {
      await updateDoc(doc(db, COLLECTIONS.LITTERS, litter.id), {
        animals: updatedAnimals,
        isActive: stillHasAvailable,
      });
      setLitters((prev) => prev.map((l) => l.id === litter.id ? { ...l, animals: updatedAnimals, isActive: stillHasAvailable } : l));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ backgroundColor: GREEN, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>← Volver</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>🐣 Mis publicaciones</Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
          Marca cada animal como no disponible cuando lo regales o vendas
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      ) : litters.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 12 }}>🐾</Text>
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 16, textAlign: 'center' }}>
            Aún no has publicado camadas
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          {litters.map((litter) => (
            <View key={litter.id} style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                {litter.photos?.[0] ? (
                  <Image source={{ uri: litter.photos[0] }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#D8F3DC', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 22 }}>{litter.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: '#1F2937' }}>Camada de {litter.parentPetName}</Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{litter.breed}</Text>
                </View>
                <View style={{ backgroundColor: litter.isActive ? '#ECFDF5' : '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: litter.isActive ? '#059669' : '#9CA3AF' }}>
                    {litter.isActive ? 'Publicada' : 'Cerrada'}
                  </Text>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                {litter.animals.map((animal, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => toggleAvailable(litter, i)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      borderRadius: 14, padding: 10, borderWidth: 1,
                      backgroundColor: animal.available ? '#F9FAFB' : '#FEF2F2',
                      borderColor: animal.available ? '#F3F4F6' : '#FECACA',
                    }}
                  >
                    {animal.photoUrl ? (
                      <Image source={{ uri: animal.photoUrl }} style={{ width: 36, height: 36, borderRadius: 10 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 16 }}>🐾</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: animal.available ? '#374151' : '#9CA3AF', textDecorationLine: animal.available ? 'none' : 'line-through' }}>
                        {animal.isGift ? '🎁 Regalo' : `💰 $${animal.price.toLocaleString('es-CL')}`}
                        {animal.sex ? ` · ${animal.sex === 'M' ? '♂' : '♀'}` : ''}
                      </Text>
                      {animal.description ? (
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }} numberOfLines={1}>{animal.description}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: animal.available ? '#059669' : '#DC2626' }}>
                      {animal.available ? 'Disponible' : 'No disponible'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
