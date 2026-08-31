import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter, useFocusEffect } from 'expo-router';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();
const PURPLE = '#7C3AED';
const NEW_ACCOUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export default function SupportDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    users: 0, owners: 0, vetsSolo: 0, vetsClinic: 0, stores: 0, trainers: 0, walkers: 0, groomers: 0, places: 0,
    pendingVets: 0, pendingStores: 0, pendingTrainers: 0, pendingWalkers: 0, pendingGroomers: 0, pendingReports: 0, pendingPromotions: 0,
    newAccounts7d: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadStats() {
    const [usersSnap, vetsSnap, storesSnap, trainersSnap, walkersSnap, groomersSnap, placesSnap, pendingReportsSnap, pendingPromosSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.USERS)),
      getDocs(collection(db, COLLECTIONS.VETERINARIANS)),
      getDocs(collection(db, COLLECTIONS.STORES)),
      getDocs(collection(db, COLLECTIONS.TRAINERS)),
      getDocs(collection(db, COLLECTIONS.WALKERS)),
      getDocs(collection(db, COLLECTIONS.GROOMERS)),
      getDocs(collection(db, COLLECTIONS.PLACES)),
      getDocs(query(collection(db, COLLECTIONS.REPORTS), where('status', '==', 'pending'))),
      getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('promotionStatus', '==', 'pending'))),
    ]);
    const users = usersSnap.docs.map((d) => d.data());
    const vets = vetsSnap.docs.map((d) => d.data() as any);
    const stores = storesSnap.docs.map((d) => d.data());
    const trainers = trainersSnap.docs.map((d) => d.data());
    const walkers = walkersSnap.docs.map((d) => d.data());
    const groomers = groomersSnap.docs.map((d) => d.data());
    // isClinic must be explicit — solo vets can also pick "servicios
    // ofrecidos", so clinicServices alone isn't a valid clinic signal.
    const isClinicOf = (v: any) => v.isClinic ?? false;
    // Every account (owner or any provider role) gets a users/{uid} doc at
    // signup — see signUp() in context/AuthContext.tsx — so counting off
    // `users` alone already covers every role without extra reads.
    const cutoff = Date.now() - NEW_ACCOUNT_WINDOW_MS;
    const newAccounts7d = users.filter((u: any) => u.createdAt && new Date(u.createdAt).getTime() > cutoff).length;
    setStats({
      users: users.length,
      owners: users.filter((u: any) => u.role === 'owner').length,
      vetsSolo: vets.filter((v) => !isClinicOf(v)).length,
      vetsClinic: vets.filter((v) => isClinicOf(v)).length,
      stores: stores.length,
      trainers: trainers.length,
      walkers: walkers.length,
      groomers: groomers.length,
      places: placesSnap.size,
      pendingVets: vets.filter((v) => v.status === 'pending').length,
      pendingStores: stores.filter((s: any) => s.status === 'pending').length,
      pendingTrainers: trainers.filter((t: any) => t.status === 'pending').length,
      pendingWalkers: walkers.filter((w: any) => w.status === 'pending').length,
      pendingGroomers: groomers.filter((g: any) => g.status === 'pending').length,
      pendingReports: pendingReportsSnap.docs.length,
      pendingPromotions: pendingPromosSnap.docs.length,
      newAccounts7d,
    });
  }

  useFocusEffect(useCallback(() => { loadStats().finally(() => setLoading(false)); }, []));
  async function onRefresh() { setRefreshing(true); await loadStats(); setRefreshing(false); }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  const statCards = [
    { label: 'Total usuarios', value: stats.users, emoji: '👥', color: '#EEF2FF', route: '/(support)/users' },
    { label: 'Dueños', value: stats.owners, emoji: '🐾', color: '#ECFDF5', route: '/(support)/users' },
    { label: 'Veterinarios', value: stats.vetsSolo, emoji: '🩺', color: '#EFF6FF', route: '/(support)/vets?kind=vet' },
    { label: 'Veterinarias', value: stats.vetsClinic, emoji: '🏥', color: '#EFF6FF', route: '/(support)/vets?kind=clinic' },
    { label: 'Tiendas', value: stats.stores, emoji: '🛒', color: '#FFF7ED', route: '/(support)/stores' },
    { label: 'Adiestradores', value: stats.trainers, emoji: '🐕', color: '#F0FDF4', route: '/(support)/trainers' },
    { label: 'Paseadores', value: stats.walkers, emoji: '🦮', color: '#FFF7ED', route: '/(support)/walkers' },
    { label: 'Peluquerías', value: stats.groomers, emoji: '✂️', color: '#FAF5FF', route: '/(support)/groomers' },
    { label: 'Lugares (Entretención)', value: stats.places, emoji: '🐾', color: '#ECFEFF', route: '/(support)/places' },
    { label: 'Promociones', value: stats.pendingPromotions, emoji: '🎉', color: '#FDF4FF', route: '/(support)/promotions' },
    { label: 'Reportes', value: stats.pendingReports, emoji: '🚩', color: '#FEF2F2', route: '/(support)/reports' },
  ];

  const pendingTotal = stats.pendingVets + stats.pendingStores + stats.pendingTrainers + stats.pendingWalkers + stats.pendingGroomers + stats.pendingReports + stats.pendingPromotions;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <ScrollView style={{ flex: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {/* Header */}
        <View style={{ backgroundColor: PURPLE, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Bienvenido, {user?.name?.split(' ')[0]}</Text>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 }}>🛡️ Panel de Administración</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>Acceso exclusivo — JunglApp</Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
          {/* New accounts highlight — the total-users counter below doesn't
              tell you WHICH ones are recent, this does. Tapping goes to the
              Usuarios list already sorted by most-recent-first. */}
          <TouchableOpacity
            onPress={() => router.push('/(support)/users?sort=recent' as any)}
            activeOpacity={0.8}
            style={{ backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#C7D2FE', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 24 }}>🆕</Text>
              <View>
                <Text style={{ fontWeight: '800', color: PURPLE, fontSize: 20 }}>{stats.newAccounts7d}</Text>
                <Text style={{ color: PURPLE, fontSize: 12 }}>Cuentas nuevas (últimos 7 días)</Text>
              </View>
            </View>
            <Text style={{ color: PURPLE, fontSize: 20 }}>›</Text>
          </TouchableOpacity>

          {/* Pending approvals — tappable cards */}
          {pendingTotal > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontWeight: '700', color: '#374151', fontSize: 15, marginBottom: 10 }}>⚠️ Validaciones pendientes</Text>
              {stats.pendingReports > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/reports' as any)}
                  style={{ backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🚩</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#DC2626', fontSize: 15 }}>{stats.pendingReports}</Text>
                      <Text style={{ color: '#DC2626', fontSize: 12 }}>Reportes pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#DC2626', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingPromotions > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/promotions' as any)}
                  style={{ backgroundColor: '#FDF4FF', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F5D0FE', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🎉</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#A21CAF', fontSize: 15 }}>{stats.pendingPromotions}</Text>
                      <Text style={{ color: '#A21CAF', fontSize: 12 }}>Promociones pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#A21CAF', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingVets > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/vets')}
                  style={{ backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#BFDBFE', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🩺</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#1D4ED8', fontSize: 15 }}>{stats.pendingVets}</Text>
                      <Text style={{ color: '#1D4ED8', fontSize: 12 }}>Veterinarios pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#1D4ED8', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingStores > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/stores')}
                  style={{ backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🛒</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#D97706', fontSize: 15 }}>{stats.pendingStores}</Text>
                      <Text style={{ color: '#D97706', fontSize: 12 }}>Tiendas pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#D97706', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingTrainers > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/trainers')}
                  style={{ backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🐕</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#15803D', fontSize: 15 }}>{stats.pendingTrainers}</Text>
                      <Text style={{ color: '#15803D', fontSize: 12 }}>Adiestradores pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#15803D', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingWalkers > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/walkers')}
                  style={{ backgroundColor: '#FFF7ED', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>🦮</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#C2410C', fontSize: 15 }}>{stats.pendingWalkers}</Text>
                      <Text style={{ color: '#C2410C', fontSize: 12 }}>Paseadores pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#C2410C', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
              {stats.pendingGroomers > 0 && (
                <TouchableOpacity
                  onPress={() => router.navigate('/(support)/groomers')}
                  style={{ backgroundColor: '#FAF5FF', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#E9D5FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 24 }}>✂️</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#7C3AED', fontSize: 15 }}>{stats.pendingGroomers}</Text>
                      <Text style={{ color: '#7C3AED', fontSize: 12 }}>Peluquerías pendientes</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#7C3AED', fontSize: 20 }}>›</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Stats grid — every card is a shortcut into its section */}
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 15, marginBottom: 12 }}>Accesos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            {statCards.map((s) => (
              <TouchableOpacity key={s.label} onPress={() => router.push(s.route as any)} activeOpacity={0.7} style={{ width: '47%', backgroundColor: s.color, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 28 }}>{s.emoji}</Text>
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#1F2937', marginTop: 4 }}>{s.value}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
