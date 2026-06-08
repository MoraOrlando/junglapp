import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

export default function SupportDashboard() {
  const { user, logOut } = useAuth();
  const [stats, setStats] = useState({ users: 0, owners: 0, vets: 0, stores: 0, trainers: 0, pendingVets: 0, pendingStores: 0, pendingTrainers: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadStats() {
    const [usersSnap, vetsSnap, storesSnap, trainersSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.USERS)),
      getDocs(collection(db, COLLECTIONS.VETERINARIANS)),
      getDocs(collection(db, COLLECTIONS.STORES)),
      getDocs(collection(db, COLLECTIONS.TRAINERS)),
    ]);
    const users = usersSnap.docs.map((d) => d.data());
    const vets = vetsSnap.docs.map((d) => d.data());
    const stores = storesSnap.docs.map((d) => d.data());
    const trainers = trainersSnap.docs.map((d) => d.data());
    setStats({
      users: users.length,
      owners: users.filter((u) => u.role === 'owner').length,
      vets: vets.length,
      stores: stores.length,
      trainers: trainers.length,
      pendingVets: vets.filter((v) => v.status === 'pending').length,
      pendingStores: stores.filter((s) => s.status === 'pending').length,
      pendingTrainers: trainers.filter((t) => t.status === 'pending').length,
    });
  }

  useEffect(() => { loadStats().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadStats(); setRefreshing(false); }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  const statCards = [
    { label: 'Total usuarios', value: stats.users, emoji: '👥', color: '#EEF2FF' },
    { label: 'Dueños', value: stats.owners, emoji: '🐾', color: '#ECFDF5' },
    { label: 'Veterinarios', value: stats.vets, emoji: '🩺', color: '#EFF6FF' },
    { label: 'Tiendas', value: stats.stores, emoji: '🛒', color: '#FFF7ED' },
    { label: 'Adiestradores', value: stats.trainers, emoji: '🐕', color: '#F0FDF4' },
  ];

  const pendingCards = [
    { label: 'Vets pendientes', value: stats.pendingVets, emoji: '⏳' },
    { label: 'Tiendas pendientes', value: stats.pendingStores, emoji: '⏳' },
    { label: 'Adiest. pendientes', value: stats.pendingTrainers, emoji: '⏳' },
  ];

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
          {/* Pending approvals alert */}
          {(stats.pendingVets + stats.pendingStores + stats.pendingTrainers) > 0 && (
            <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A' }}>
              <Text style={{ fontWeight: '700', color: '#92400E', fontSize: 14, marginBottom: 8 }}>⚠️ Validaciones pendientes</Text>
              {pendingCards.filter((p) => p.value > 0).map((p) => (
                <Text key={p.label} style={{ color: '#78350F', fontSize: 13, marginTop: 2 }}>• {p.label}: {p.value}</Text>
              ))}
            </View>
          )}

          {/* Stats grid */}
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 15, marginBottom: 12 }}>Estadísticas generales</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            {statCards.map((s) => (
              <View key={s.label} style={{ width: '47%', backgroundColor: s.color, borderRadius: 16, padding: 16 }}>
                <Text style={{ fontSize: 28 }}>{s.emoji}</Text>
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#1F2937', marginTop: 4 }}>{s.value}</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity onPress={logOut} style={{ margin: 20, borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: '#FEF2F2', marginBottom: 40 }}>
          <Text style={{ color: '#EF4444', fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
