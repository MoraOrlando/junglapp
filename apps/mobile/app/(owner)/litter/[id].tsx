import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';

const { db } = initFirebase();
const GREEN = '#2D6A4F';
const SCREEN_WIDTH = Dimensions.get('window').width;

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
  ownerId: string;
  ownerName: string;
  parentPetId: string;
  parentPetName: string;
  species: string;
  breed: string;
  photos: string[];
  animals: LitterAnimal[];
  description: string;
  createdAt: string;
  isActive: boolean;
}

export default function LitterDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [litter, setLitter] = useState<Litter | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.LITTERS, id)).then((snap) => {
      if (snap.exists()) setLitter({ id: snap.id, ...snap.data() } as Litter);
    }).catch((e) => Alert.alert('Error', e.message)).finally(() => setLoading(false));
  }, [id]);

  async function handleContact() {
    if (!user || !litter) return;
    if (litter.ownerId === user.uid) {
      Alert.alert('Esta es tu publicación', 'No puedes chatear contigo mismo.');
      return;
    }
    setContacting(true);
    try {
      const existingSnap = await getDocs(
        query(
          collection(db, COLLECTIONS.CHATS),
          where('participants', 'array-contains', user.uid),
          where('litterId', '==', litter.id),
        )
      );
      let chatId: string;
      if (!existingSnap.empty) {
        chatId = existingSnap.docs[0].id;
      } else {
        const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
          participants: [user.uid, litter.ownerId],
          participantNames: {
            [user.uid]: user.name || 'Usuario',
            [litter.ownerId]: litter.ownerName,
          },
          litterId: litter.id,
          chatType: 'litter',
          lastMessage: `¡Hola! Vi tu publicación de ${litter.parentPetName} y me interesa 🐾`,
          lastMessageAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        chatId = chatRef.id;
      }
      router.push(`/(owner)/chat/${chatId}` as any);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setContacting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} size="large" />
      </SafeAreaView>
    );
  }

  if (!litter) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>🐾</Text>
        <Text style={{ color: '#6B7280', fontSize: 15, textAlign: 'center' }}>Esta publicación ya no está disponible.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: GREEN, fontWeight: '700' }}>← Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isOwner = litter.ownerId === user?.uid;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} edges={['bottom']}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Photo gallery */}
        {litter.photos?.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {litter.photos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={{ width: SCREEN_WIDTH, height: 260 }} contentFit="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={{ width: '100%', height: 200, backgroundColor: '#D8F3DC', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 64 }}>{litter.species === 'cat' ? '🐈' : '🐕'}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 10 }}
        >
          <Text style={{ fontSize: 18 }}>←</Text>
        </TouchableOpacity>

        <View style={{ padding: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>Camada de {litter.parentPetName}</Text>
          <Text style={{ color: '#6B7280', fontSize: 14, marginTop: 2 }}>{litter.breed}</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>Publicado por {litter.ownerName}</Text>

          {litter.description ? (
            <Text style={{ color: '#374151', fontSize: 14, marginTop: 14, lineHeight: 21 }}>{litter.description}</Text>
          ) : null}

          <Text style={{ fontSize: 16, fontWeight: '800', color: '#374151', marginTop: 24, marginBottom: 12 }}>
            🐾 Crías ({litter.animals.filter((a) => a.available).length} disponibles de {litter.animals.length})
          </Text>

          <View style={{ gap: 12 }}>
            {litter.animals.map((animal, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 12,
                  borderWidth: 1, borderColor: '#F3F4F6', opacity: animal.available ? 1 : 0.55,
                }}
              >
                {animal.photoUrl ? (
                  <Image source={{ uri: animal.photoUrl }} style={{ width: 72, height: 72, borderRadius: 14 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 30 }}>{litter.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: animal.isGift ? '#92400E' : '#065F46' }}>
                      {animal.isGift ? '🎁 Regalo' : `💰 $${animal.price.toLocaleString('es-CL')}`}
                    </Text>
                    {animal.sex ? (
                      <Text style={{ fontSize: 13, color: animal.sex === 'M' ? '#3B82F6' : '#EC4899', fontWeight: '700' }}>
                        {animal.sex === 'M' ? '♂ Macho' : '♀ Hembra'}
                      </Text>
                    ) : null}
                  </View>
                  {animal.description ? (
                    <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>{animal.description}</Text>
                  ) : null}
                  {!animal.available && (
                    <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 4 }}>Ya no disponible</Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {!isOwner && (
            <TouchableOpacity
              onPress={handleContact}
              disabled={contacting}
              style={{ backgroundColor: GREEN, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 24, opacity: contacting ? 0.7 : 1 }}
            >
              {contacting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>💬 Contactar dueño</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
