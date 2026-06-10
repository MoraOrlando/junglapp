import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Pet } from '@junglapp/types';

const { db } = initFirebase();

interface ControlReminder {
  id: string;
  petId: string;
  date: string;
  vetName?: string | null;
}

export default function OwnerHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [pets, setPets] = useState<Pet[]>([]);
  const [reminders, setReminders] = useState<ControlReminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.PETS), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setPets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pet)));
    });
    return unsub;
  }, [user?.uid]);

  // All pending vet control reminders (used for the banner and per-pet health icon)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, COLLECTIONS.REMINDERS), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setReminders(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((r) => r.type === 'vet_control' && !r.done)
          .sort((a, b) => a.date.localeCompare(b.date))
      );
    });
    return unsub;
  }, [user?.uid]);

  const today = new Date().toISOString().split('T')[0];
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Banner: controls coming up in the next 7 days
  const upcomingReminders = reminders.filter((r) => r.date >= today && r.date <= weekAhead);

  // Health status per pet: overdue control → pending; control within 7 days → near; else healthy
  function petHealth(petId: string): { emoji: string; label: string; bg: string; color: string } {
    const petReminders = reminders.filter((r) => r.petId === petId);
    if (petReminders.some((r) => r.date < today)) return { emoji: '⏰', label: 'Control pendiente', bg: '#FEE2E2', color: '#DC2626' };
    if (petReminders.some((r) => r.date >= today && r.date <= weekAhead)) return { emoji: '🔔', label: 'Control cercano', bg: '#FEF3C7', color: '#B45309' };
    return { emoji: '💚', label: 'Saludable', bg: '#D1FAE5', color: '#047857' };
  }

  const initials = user?.name
    ? user.name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
    : '🐾';

  async function onRefresh() {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header: avatar + name → tap goes to profile */}
      <View className="flex-row justify-between items-center px-6 pt-4 pb-3">
        <TouchableOpacity
          className="flex-row items-center gap-3 flex-1"
          onPress={() => router.push('/(owner)/profile' as any)}
          activeOpacity={0.7}
        >
          {user?.photoUrl ? (
            <Image source={{ uri: user.photoUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
          ) : (
            <View className="w-12 h-12 rounded-full bg-primary-500 items-center justify-center">
              <Text className="text-white font-bold text-base">{initials}</Text>
            </View>
          )}
          <View>
            <Text className="text-gray-400 text-sm">Hola,</Text>
            <Text className="text-2xl font-bold text-primary-700">{user?.name?.split(' ')[0] || 'Family Lover'} 🐾</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="bg-primary-500 rounded-full w-11 h-11 items-center justify-center"
          onPress={() => router.push('/(owner)/pets/add' as any)}
        >
          <Text className="text-white text-2xl font-light">+</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming vet control reminders */}
      {upcomingReminders.length > 0 && (
        <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
          {upcomingReminders.map((r) => {
            const petName = pets.find((p) => p.id === r.petId)?.name ?? 'tu mascota';
            const isToday = r.date === today;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => router.push(`/(owner)/pets/${r.petId}` as any)}
                style={{
                  backgroundColor: isToday ? '#FEF2F2' : '#FFFBEB',
                  borderWidth: 1, borderColor: isToday ? '#FECACA' : '#FDE68A',
                  borderRadius: 14, padding: 12, marginBottom: 6,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                }}
              >
                <Text style={{ fontSize: 22 }}>🔔</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 13, color: isToday ? '#DC2626' : '#92400E' }}>
                    {isToday ? '¡Control veterinario HOY!' : 'Próximo control veterinario'}
                  </Text>
                  <Text style={{ fontSize: 12, color: isToday ? '#EF4444' : '#B45309', marginTop: 1 }}>
                    {petName} — {r.date}{r.vetName ? ` · ${r.vetName}` : ''}
                  </Text>
                </View>
                <Text style={{ color: '#D1D5DB', fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Lost pets access */}
      <TouchableOpacity
        onPress={() => router.push('/(owner)/lost' as any)}
        activeOpacity={0.85}
        style={{
          marginHorizontal: 24, marginBottom: 14, backgroundColor: '#FEF2F2',
          borderWidth: 1, borderColor: '#FECACA', borderRadius: 16,
          padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
        }}
      >
        <Text style={{ fontSize: 28 }}>🔍</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: '#DC2626', fontSize: 15 }}>Mascotas extraviadas</Text>
          <Text style={{ color: '#F87171', fontSize: 12, marginTop: 1 }}>Mira el mapa y ayuda a encontrarlas cerca de ti</Text>
        </View>
        <Text style={{ color: '#FCA5A5', fontSize: 20 }}>›</Text>
      </TouchableOpacity>

      <Text className="px-6 text-gray-700 font-semibold text-base mb-2">Mis Mascotas</Text>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {pets.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-6xl mb-4">🐾</Text>
            <Text className="text-gray-600 text-lg font-medium">¡Aún no tienes mascotas!</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              Agrega tu primera mascota y comienza a disfrutar JunglApp
            </Text>
            <TouchableOpacity
              className="bg-primary-500 rounded-2xl px-6 py-3 mt-6"
              onPress={() => router.push('/(owner)/pets/add' as any)}
            >
              <Text className="text-white font-semibold">Agregar Mascota</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-4 pb-6">
            {pets.map((pet) => {
              const health = petHealth(pet.id!);
              return (
                <TouchableOpacity
                  key={pet.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100"
                  onPress={() => router.push(`/(owner)/pets/${pet.id}` as any)}
                  activeOpacity={0.9}
                >
                  {/* Large photo */}
                  <View style={{ height: 170, backgroundColor: '#D8F3DC' }}>
                    {pet.photos && pet.photos.length > 0 ? (
                      <Image
                        source={{ uri: pet.photos[0] }}
                        style={{ width: '100%', height: 170 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 64 }}>{pet.species === 'cat' ? '🐈' : '🐕'}</Text>
                      </View>
                    )}
                    {/* Health status badge */}
                    <View style={{
                      position: 'absolute', top: 10, right: 10,
                      backgroundColor: health.bg, borderRadius: 14,
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}>
                      <Text style={{ fontSize: 13 }}>{health.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: health.color }}>{health.label}</Text>
                    </View>
                    {pet.lookingForPartner && (
                      <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Text style={{ fontSize: 13 }}>💕</Text>
                      </View>
                    )}
                  </View>

                  <View className="flex-row items-center p-4">
                    <View className="flex-1">
                      <Text className="font-bold text-gray-800 text-lg">{pet.name}</Text>
                      <Text className="text-gray-500 text-sm">{pet.breed} · {pet.color}</Text>
                      <Text className="text-gray-400 text-xs mt-0.5">
                        {pet.chipNumber ? `Chip: ${pet.chipNumber}` : 'Sin chip registrado'}
                      </Text>
                    </View>
                    <Text className="text-gray-300 text-xl">›</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
