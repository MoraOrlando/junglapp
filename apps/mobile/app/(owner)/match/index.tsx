import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Dimensions,
  Animated, Modal, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, getDoc, onSnapshot, limit,
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS, RTDB_PATHS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import { distanceKm } from '../../../lib/distance';
import { ownerFilterRegionKey } from '../../../lib/locationKey';
import { logMatchLiked, logMatchMutual } from '../../../lib/analytics';
import type { Pet } from '@junglapp/types';

const MAX_CANDIDATES = 200;

const { width } = Dimensions.get('window');
const { db, rtdb } = initFirebase();

function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return Math.max(age, 0);
}

function petHealthTag(pet: Pet): { emoji: string; label: string; bg: string; color: string } | null {
  const record = pet.medicalRecord;
  if (record?.conditions?.length > 0) return { emoji: '⚠️', label: 'Condición médica', bg: 'rgba(220,38,38,0.85)', color: '#fff' };
  if (record?.vaccinations?.length > 0) return { emoji: '💉', label: 'Vacunado', bg: 'rgba(22,163,74,0.85)', color: '#fff' };
  return null;
}

export default function MatchScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [candidates, setCandidates] = useState<Pet[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedMyPet, setSelectedMyPet] = useState<Pet | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const [mutualMatch, setMutualMatch] = useState<{ chatId: string; candidateName: string; myPetName: string } | null>(null);
  const [galleryPet, setGalleryPet] = useState<Pet | null>(null);
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState(0);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  const flameScale = useRef(new Animated.Value(0)).current;
  const flameOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Prefer the location saved at registration; fall back to live GPS
    // (same pattern as the "Cerca de ti" screens) so the distance badge can
    // still show up for owners who didn't capture it at signup.
    if ((user as any)?.location) { setMyLocation((user as any).location); return; }
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {}
    })();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    loadMyPets();
    const q = query(collection(db, COLLECTIONS.CHATS), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snap) => setMatchCount(snap.docs.filter((d) => !!d.data().matchId).length), (err) => { if (__DEV__) console.log('match listener:', err.code); });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!mutualMatch) return;
    flameScale.setValue(0);
    flameOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(flameScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.timing(flameOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [mutualMatch]);

  async function loadMyPets() {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid))
    );
    setMyPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
  }

  async function loadCandidates(myPet: Pet) {
    if (!user) return;
    setSelectedMyPet(myPet);
    const filterRegionKey = ownerFilterRegionKey(user);
    const constraints = [where('lookingForPartner', '==', true)];
    if (filterRegionKey) constraints.push(where('regionKey', '==', filterRegionKey));
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PETS), ...constraints, limit(MAX_CANDIDATES))
    );
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet));
    const likedSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.MATCHES),
        where('owner1Id', '==', user.uid),
        where('pet1Id', '==', myPet.id),
      )
    );
    const likedIds = new Set(likedSnap.docs.map((d) => d.data().pet2Id as string));
    setCandidates(all.filter((p) => p.ownerId !== user.uid && !likedIds.has(p.id)));
    setCurrentIndex(0);
  }

  async function handleVote(liked: boolean) {
    if (!selectedMyPet || !user || candidates.length === 0) return;
    const candidate = candidates[currentIndex];

    if (liked) {
      logMatchLiked();
      try {
        const mutualSnap = await getDocs(
          query(
            collection(db, COLLECTIONS.MATCHES),
            where('pet1Id', '==', candidate.id),
            where('pet2Id', '==', selectedMyPet.id),
            where('owner2Id', '==', user.uid),
            where('status', '==', 'pending'),
            limit(1),
          )
        );

        if (!mutualSnap.empty) {
          const existingMatch = mutualSnap.docs[0];
          // Firestore rules only allow updating ['status', 'updatedAt'] on
          // this collection — any other field name makes the whole update
          // rejected as permission-denied, which silently aborted the vote
          // before it could advance to the next candidate or show the modal.
          await updateDoc(existingMatch.ref, {
            status: 'matched',
            updatedAt: new Date().toISOString(),
          });
          // Best-effort only — firestore.rules doesn't let one owner read
          // another owner's users/{uid} doc (that read is reserved for
          // professionals with a clientLinks record), so this always threw
          // permission-denied here and aborted the whole match before the
          // chat/modal below ever ran. The chat list already falls back to
          // "Usuario" when participantNames is missing an entry.
          let ownerData: { name?: string } | null = null;
          try {
            const ownerDoc = await getDoc(doc(db, COLLECTIONS.USERS, candidate.ownerId));
            ownerData = ownerDoc.exists() ? ownerDoc.data() : null;
          } catch {}
          const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
            participants: [user.uid, candidate.ownerId],
            participantNames: {
              [user.uid]: user.name,
              [candidate.ownerId]: ownerData?.name || 'Usuario',
            },
            // candidate.ownerPhone comes from the Pet doc (denormalized when
            // its owner turned lookingForPartner on) — ownerData?.phone would
            // always be undefined since that users/{uid} read is denied.
            participantPhones: {
              ...(user.phone ? { [user.uid]: user.phone } : {}),
              ...(candidate.ownerPhone ? { [candidate.ownerId]: candidate.ownerPhone } : {}),
            },
            matchId: existingMatch.id,
            chatType: 'match',
            lastMessage: `🔥 ¡${selectedMyPet.name} y ${candidate.name} hicieron match!`,
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          try {
            await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatRef.id}/${user.uid}`), true);
            await set(ref(rtdb, `${RTDB_PATHS.CHAT_MEMBERS}/${chatRef.id}/${candidate.ownerId}`), true);
          } catch {}
          // In-app notification for the other owner (the one who liked
          // first and isn't looking at this screen) — the push above can
          // be delayed/missing if they don't have a token, this shows up
          // immediately the next time they open the app.
          try {
            await set(ref(rtdb, `${RTDB_PATHS.NOTIFICATIONS}/${candidate.ownerId}/match_${existingMatch.id}`), {
              type: 'new_match',
              matchId: existingMatch.id,
              chatId: chatRef.id,
              petName: candidate.name,
              matchedWithPetName: selectedMyPet.name,
              createdAt: new Date().toISOString(),
              read: false,
            });
          } catch {}
          logMatchMutual();
          setMutualMatch({ chatId: chatRef.id, candidateName: candidate.name, myPetName: selectedMyPet.name });
        } else {
          await addDoc(collection(db, COLLECTIONS.MATCHES), {
            pet1Id: selectedMyPet.id,
            pet2Id: candidate.id,
            owner1Id: user.uid,
            owner2Id: candidate.ownerId,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        Alert.alert('Error', e.message || 'No se pudo registrar el match.');
        return;
      }
    }

    setCurrentIndex((i) => i + 1);
  }

  const petsLookingForPartner = myPets.filter((p) => p.lookingForPartner);
  const candidate = candidates[currentIndex];

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Mutual match modal */}
      <Modal visible={!!mutualMatch} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Animated.View style={{ transform: [{ scale: flameScale }], opacity: flameOpacity, alignItems: 'center' }}>
            <Text style={{ fontSize: 90 }}>🔥</Text>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 8, textAlign: 'center' }}>¡Es un Match!</Text>
            <Text style={{ color: '#fde68a', fontSize: 17, marginTop: 10, textAlign: 'center', lineHeight: 26 }}>
              {mutualMatch?.myPetName} y {mutualMatch?.candidateName}{'\n'}se gustaron mutuamente 🐾
            </Text>
            <TouchableOpacity
              onPress={() => {
                const chatId = mutualMatch?.chatId;
                setMutualMatch(null);
                if (chatId) router.push(`/(owner)/chat/${chatId}` as any);
              }}
              style={{ marginTop: 28, backgroundColor: '#f97316', borderRadius: 24, paddingHorizontal: 36, paddingVertical: 14 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>💬 Enviar mensaje</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMutualMatch(null)} style={{ marginTop: 14 }}>
              <Text style={{ color: '#9ca3af', fontSize: 14 }}>Seguir viendo mascotas</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Photo gallery modal */}
      <Modal visible={!!galleryPet} transparent animationType="slide" onRequestClose={() => setGalleryPet(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 60, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setGalleryPet(null)}
          >
            <Text style={{ color: '#fff', fontSize: 20 }}>✕</Text>
          </TouchableOpacity>

          {galleryPet && (
            <>
              {/* Main photo */}
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                {(galleryPet.photos?.length ?? 0) > 0 ? (
                  <Image
                    source={{ uri: galleryPet.photos[galleryPhotoIndex] }}
                    style={{ width: width, height: width }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <Text style={{ fontSize: 80 }}>{galleryPet.species === 'cat' ? '🐈' : '🐕'}</Text>
                )}

                {/* Photo dots */}
                {(galleryPet.photos?.length ?? 0) > 1 && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                    {galleryPet.photos.map((_, i) => (
                      <TouchableOpacity key={i} onPress={() => setGalleryPhotoIndex(i)}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === galleryPhotoIndex ? '#f97316' : 'rgba(255,255,255,0.4)' }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Info sheet */}
              <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>
                <Text style={{ fontSize: 26, fontWeight: '800', color: '#1F2937' }}>{galleryPet.name}</Text>
                <Text style={{ color: '#6B7280', fontSize: 15, marginTop: 2 }}>{galleryPet.breed} · {galleryPet.color}</Text>
                {galleryPet.sex ? (
                  <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
                    {galleryPet.sex === 'M' ? '♂ Macho' : '♀ Hembra'}
                    {galleryPet.weight != null ? ` · ${galleryPet.weight} kg` : ''}
                  </Text>
                ) : null}
                {((galleryPet as any).matchProfile?.about || galleryPet.description) ? (
                  <Text style={{ color: '#374151', fontSize: 14, marginTop: 12, lineHeight: 22 }}>
                    {(galleryPet as any).matchProfile?.about || galleryPet.description}
                  </Text>
                ) : null}
                {(galleryPet as any).matchProfile?.personality?.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                    {((galleryPet as any).matchProfile.personality as string[]).map((p: string) => (
                      <View key={p} style={{ backgroundColor: '#fff7ed', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#ea580c', fontSize: 12 }}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Header */}
      <View className="px-6 pt-4">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text className="text-2xl font-bold text-primary-700">Match 🔥</Text>
            <Text className="text-gray-500 text-sm mt-1">Encuentra pareja para tu mascota</Text>
          </View>
          {matchCount > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(owner)/chat' as any)}
              style={{ backgroundColor: '#fff7ed', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fed7aa' }}
            >
              <Text style={{ fontSize: 20 }}>🔥</Text>
              <Text style={{ color: '#ea580c', fontWeight: '700', fontSize: 16 }}>{matchCount}</Text>
              <Text style={{ color: '#fb923c', fontSize: 10 }}>matches</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {petsLookingForPartner.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-6xl mb-4">🔥</Text>
          <Text className="text-gray-700 text-lg font-semibold text-center">Ninguna mascota en modo Match</Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">
            Ve al perfil de tu mascota y activa "Busca Pareja" para participar
          </Text>
          <TouchableOpacity
            className="mt-6 rounded-2xl px-6 py-3"
            style={{ backgroundColor: '#f97316' }}
            onPress={() => router.push('/(owner)/pets' as any)}
          >
            <Text className="text-white font-semibold">Ver mis mascotas</Text>
          </TouchableOpacity>
        </View>
      ) : !selectedMyPet ? (
        <ScrollView className="flex-1 px-6 mt-6">
          <Text className="text-gray-600 font-medium mb-4">Selecciona qué mascota quieres mostrar:</Text>
          <View className="gap-3">
            {petsLookingForPartner.map((pet) => (
              <TouchableOpacity
                key={pet.id}
                className="bg-white rounded-2xl p-4 flex-row items-center gap-4 shadow-sm border border-gray-100"
                onPress={() => loadCandidates(pet)}
              >
                {pet.photos?.[0] ? (
                  <Image
                    source={{ uri: pet.photos[0] }}
                    style={{ width: 56, height: 56, borderRadius: 16 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={{ backgroundColor: '#fff7ed', borderRadius: 16, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-bold text-gray-800">{pet.name}</Text>
                  <Text className="text-gray-500 text-sm">{pet.breed}</Text>
                </View>
                <Text style={{ color: '#f97316' }}>🔥 Match →</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : currentIndex >= candidates.length ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-5xl mb-4">🎉</Text>
          <Text className="text-gray-700 text-lg font-semibold">¡Has visto todos!</Text>
          <Text className="text-gray-400 text-sm mt-2 text-center">No hay más candidatos por ahora.</Text>
          <TouchableOpacity
            className="mt-6 rounded-2xl px-6 py-3"
            style={{ backgroundColor: '#f97316' }}
            onPress={() => { setSelectedMyPet(null); setCandidates([]); }}
          >
            <Text className="text-white font-semibold">Cambiar mascota</Text>
          </TouchableOpacity>
        </View>
      ) : candidate ? (
        <View className="flex-1 px-6 mt-6">
          {(() => {
            const age = calculateAge(candidate.birthDate);
            const healthTag = petHealthTag(candidate);
            const personality: string[] = (candidate as any).matchProfile?.personality || [];
            const distance = (myLocation && candidate.location)
              ? distanceKm(myLocation.lat, myLocation.lng, candidate.location.lat, candidate.location.lng)
              : null;
            return (
              <View style={{
                borderRadius: 28, overflow: 'hidden', marginBottom: 20,
                borderWidth: 3, borderColor: '#f97316',
                shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
              }}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => { setGalleryPhotoIndex(0); setGalleryPet(candidate); }}
                  style={{ height: width * 1.15, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' }}
                >
                  {candidate.photos?.[0] ? (
                    <Image
                      source={{ uri: candidate.photos[0] }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      priority="high"
                    />
                  ) : (
                    <Text style={{ fontSize: 120 }}>{candidate.species === 'cat' ? '🐈' : '🐕'}</Text>
                  )}

                  {/* Photo count + "ver más" hint, top-right */}
                  <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 }}>
                    {(candidate.photos?.length ?? 0) > 1 && (
                      <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>📷 {candidate.photos.length}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ position: 'absolute', top: 12, left: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '600' }}>{currentIndex + 1} / {candidates.length}</Text>
                  </View>

                  {/* Bottom scrim with name/age/breed/tags/distance, overlaid on the photo */}
                  <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }} numberOfLines={1}>{candidate.name}</Text>
                        {age != null && <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 18, fontWeight: '600' }}>, {age}</Text>}
                        {candidate.chipNumber ? <Text style={{ fontSize: 16 }}>✅</Text> : null}
                      </View>
                      {distance != null && (
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                            📍 {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 2 }}>
                      {candidate.breed}
                      {candidate.sex ? ` · ${candidate.sex === 'M' ? '♂ Macho' : '♀ Hembra'}` : ''}
                      {candidate.weight != null ? ` · ${candidate.weight} kg` : ''}
                    </Text>
                    {(healthTag || personality.length > 0) && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {healthTag && (
                          <View style={{ backgroundColor: healthTag.bg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ color: healthTag.color, fontSize: 11, fontWeight: '700' }}>{healthTag.emoji} {healthTag.label}</Text>
                          </View>
                        )}
                        {personality.map((p) => (
                          <View key={p} style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{p}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            );
          })()}

          {((candidate as any).matchProfile?.about || candidate.description) ? (
            <Text className="text-gray-600 text-sm mb-4 leading-relaxed" numberOfLines={3}>
              {(candidate as any).matchProfile?.about || candidate.description}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 40 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#fff', borderRadius: 40, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: '#fee2e2' }}
              onPress={() => handleVote(false)}
            >
              <Text style={{ fontSize: 36 }}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: '#f97316', borderRadius: 40, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', shadowColor: '#f97316', shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 }}
              onPress={() => handleVote(true)}
            >
              <Text style={{ fontSize: 36 }}>🔥</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity className="mt-6 items-center" onPress={() => { setSelectedMyPet(null); setCandidates([]); }}>
            <Text className="text-gray-400 text-sm">← Cambiar mascota</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
