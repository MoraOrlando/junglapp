import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, addDoc, orderBy } from 'firebase/firestore';
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

export default function LitterDiscoveryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [litters, setLitters] = useState<Litter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLitters();
  }, []);

  async function loadLitters() {
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.LITTERS), where('isActive', '==', true), orderBy('createdAt', 'desc'))
      );
      setLitters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Litter)));
    } catch {
      // index may still be building — fall back to unordered
      try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.LITTERS), where('isActive', '==', true)));
        setLitters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Litter)));
      } catch (e: any) {
        Alert.alert('Error', e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleContact(litter: Litter) {
    if (!user) return;
    if (litter.ownerId === user.uid) {
      Alert.alert('Esta es tu publicación', 'No puedes chatear contigo mismo.');
      return;
    }
    try {
      // Create or find existing chat
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
    }
  }

  const availableCount = (litter: Litter) => litter.animals.filter((a) => a.available).length;
  const hasGifts = (litter: Litter) => litter.animals.some((a) => a.isGift && a.available);
  const minPrice = (litter: Litter) => {
    const selling = litter.animals.filter((a) => !a.isGift && a.available);
    if (!selling.length) return null;
    return Math.min(...selling.map((a) => a.price));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header */}
      <View style={{ backgroundColor: GREEN, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>← Volver</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>🌱 Haz crecer tu familia</Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>
          Mascotas disponibles para adoptar o comprar cerca de ti
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'flex-start' }}
            onPress={() => router.push('/(owner)/litter/add' as any)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>🐣 Publicar camada</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, alignSelf: 'flex-start' }}
            onPress={() => router.push('/(owner)/litter/mine' as any)}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>📋 Mis publicaciones</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      ) : litters.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 12 }}>🐾</Text>
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 17, textAlign: 'center' }}>
            Sin publicaciones aún
          </Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
            Sé el primero en compartir tu camada con la comunidad JunglApp
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: GREEN, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 12, marginTop: 20 }}
            onPress={() => router.push('/(owner)/litter/add' as any)}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>🐣 Publicar camada</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          {litters.map((litter) => {
            const count = availableCount(litter);
            const gifts = hasGifts(litter);
            const price = minPrice(litter);
            return (
              <TouchableOpacity
                key={litter.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/(owner)/litter/${litter.id}` as any)}
                style={{ backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}
              >
                {/* Photos */}
                {litter.photos?.[0] ? (
                  <Image source={{ uri: litter.photos[0] }} style={{ width: '100%', height: 200 }} contentFit="cover" />
                ) : (
                  <View style={{ width: '100%', height: 140, backgroundColor: '#D8F3DC', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 64 }}>{litter.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                )}

                {/* Badges */}
                <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 }}>
                  {gifts && (
                    <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '700' }}>🎁 Gratis</Text>
                    </View>
                  )}
                  {price !== null && (
                    <View style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#065F46', fontSize: 12, fontWeight: '700' }}>💰 Desde ${price.toLocaleString()}</Text>
                    </View>
                  )}
                </View>

                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 17, color: '#1F2937' }}>
                        Camada de {litter.parentPetName}
                      </Text>
                      <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
                        {litter.breed} · {count} {count === 1 ? 'disponible' : 'disponibles'}
                      </Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
                        Por {litter.ownerName}
                      </Text>
                    </View>
                  </View>

                  {litter.description ? (
                    <Text style={{ color: '#4B5563', fontSize: 13, marginTop: 10, lineHeight: 20 }} numberOfLines={3}>
                      {litter.description}
                    </Text>
                  ) : null}

                  {/* Animal list preview */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {litter.animals.filter((a) => a.available).slice(0, 6).map((animal, i) => (
                      <View
                        key={i}
                        style={{
                          backgroundColor: animal.isGift ? '#FEF3C7' : '#ECFDF5',
                          borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: animal.isGift ? '#92400E' : '#065F46' }}>
                          {animal.isGift ? '🎁 Gratis' : `💰 $${animal.price.toLocaleString()}`}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 }}
                    onPress={() => handleContact(litter)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>💬 Contactar dueño</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
