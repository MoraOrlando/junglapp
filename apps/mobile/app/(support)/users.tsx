import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const ACCOUNT_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#ECFDF5', text: '#059669', label: 'Activo' },
  under_review: { bg: '#FFFBEB', text: '#D97706', label: 'En revisión' },
  blocked: { bg: '#FEF2F2', text: '#EF4444', label: 'Bloqueado' },
};

type TabType = 'users' | 'providers';

interface Provider { id: string; name: string; email: string; type: string; status: string; address?: string; }

export default function UsersScreen() {
  const [tab, setTab] = useState<TabType>('providers');
  const [users, setUsers] = useState<User[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const [usersSnap, vetsSnap, storesSnap] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.USERS)),
      getDocs(collection(db, COLLECTIONS.VETERINARIANS)),
      getDocs(collection(db, COLLECTIONS.STORES)),
    ]);
    setUsers(usersSnap.docs.map((d) => ({ ...d.data() } as User)).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    const vets: Provider[] = vetsSnap.docs.map((d) => ({ id: d.id, type: 'vet', ...d.data() } as any));
    const stores: Provider[] = storesSnap.docs.map((d) => ({ id: d.id, type: 'store', ...d.data() } as any));
    setProviders([...vets, ...stores].sort((a, b) => a.name.localeCompare(b.name)));
  }

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

  const lowerSearch = search.toLowerCase();
  const filteredUsers = users.filter((u) => !search || u.name?.toLowerCase().includes(lowerSearch) || u.email?.toLowerCase().includes(lowerSearch));
  const filteredProviders = providers.filter((p) => !search || p.name?.toLowerCase().includes(lowerSearch) || p.email?.toLowerCase().includes(lowerSearch));

  async function toggleUserActive(u: User) {
    const isBlocked = u.accountStatus === 'blocked';
    const action = isBlocked ? 'reactivar' : 'bloquear';
    Alert.alert('Confirmar', `¿Deseas ${action} la cuenta de "${u.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: isBlocked ? 'default' : 'destructive',
        onPress: async () => {
          const newStatus = isBlocked ? 'active' : 'blocked';
          await updateDoc(doc(db, COLLECTIONS.USERS, u.uid), { accountStatus: newStatus });
          setUsers((prev) => prev.map((x) => x.uid === u.uid ? { ...x, accountStatus: newStatus } : x));
        },
      },
    ]);
  }

  async function toggleProviderActive(p: Provider) {
    const isActive = p.status !== 'inactive';
    const action = isActive ? 'desactivar' : 'reactivar';
    Alert.alert('Confirmar', `¿Deseas ${action} "${p.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar', onPress: async () => {
          const col = p.type === 'vet' ? COLLECTIONS.VETERINARIANS : COLLECTIONS.STORES;
          const newStatus = isActive ? 'inactive' : 'approved';
          await updateDoc(doc(db, col, p.id), { status: newStatus });
          setProviders((prev) => prev.map((x) => x.id === p.id ? { ...x, status: newStatus } : x));
        },
      },
    ]);
  }

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 10 }}>🔍 Buscar</Text>

        {/* Tab selector */}
        <View style={{ flexDirection: 'row', backgroundColor: '#EDE9FE', borderRadius: 12, padding: 4, marginBottom: 10 }}>
          {([['providers', '🏢 Cuentas'], ['users', '👥 Usuarios']] as const).map(([t, label]) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={{ flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: tab === t ? '#fff' : 'transparent' }}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: tab === t ? PURPLE : '#7C3AED99' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
          <Text style={{ color: '#9CA3AF', marginRight: 8 }}>🔍</Text>
          <TextInput style={{ flex: 1, paddingVertical: 12, fontSize: 14 }} placeholder="Buscar por nombre o correo..." value={search} onChangeText={setSearch} />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: '#9CA3AF', fontSize: 18 }}>✕</Text></TouchableOpacity>}
        </View>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {tab === 'providers' ? (
          <>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>{filteredProviders.length} cuenta(s) encontrada(s)</Text>
            {filteredProviders.map((p) => {
              const isActive = p.status !== 'inactive';
              const typeLabel = p.type === 'vet' ? '🩺 Veterinario' : '🛒 Tienda';
              const statusColor = p.status === 'approved' ? '#059669' : p.status === 'pending' ? '#D97706' : p.status === 'inactive' ? '#9CA3AF' : '#EF4444';
              const statusLabel = p.status === 'approved' ? 'Aprobado' : p.status === 'pending' ? 'Pendiente' : p.status === 'inactive' ? 'Inactivo' : 'Rechazado';
              return (
                <View key={p.id} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', opacity: isActive ? 1 : 0.65 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{p.name}</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{p.email}</Text>
                      {p.address && <Text style={{ color: '#9CA3AF', fontSize: 12 }}>📍 {p.address}</Text>}
                    </View>
                    <View>
                      <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4, alignItems: 'center' }}>
                        <Text style={{ color: PURPLE, fontSize: 11, fontWeight: '600' }}>{typeLabel}</Text>
                      </View>
                      <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignItems: 'center', backgroundColor: isActive ? '#ECFDF5' : '#F3F4F6' }}>
                        <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600' }}>{statusLabel}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleProviderActive(p)}
                    style={{ marginTop: 10, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: isActive ? '#FEF2F2' : '#ECFDF5' }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 13, color: isActive ? '#EF4444' : '#059669' }}>
                      {isActive ? '🔴 Desactivar cuenta' : '🟢 Reactivar cuenta'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : (
          <>
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>{filteredUsers.length} usuario(s) encontrado(s)</Text>
            {filteredUsers.map((u) => {
              const accountStatus = u.accountStatus || 'active';
              const isBlocked = accountStatus === 'blocked';
              const sc = ACCOUNT_STATUS_COLORS[accountStatus] || ACCOUNT_STATUS_COLORS.active;
              return (
                <View key={u.uid} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', opacity: isBlocked ? 0.65 : 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{u.name}</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{u.email}</Text>
                      <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6 }}>
                        <Text style={{ color: PURPLE, fontSize: 11, fontWeight: '600' }}>{u.role}</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: sc.text, fontSize: 11, fontWeight: '600' }}>{sc.label}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => toggleUserActive(u)}
                    style={{ marginTop: 10, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: isBlocked ? '#ECFDF5' : '#FEF2F2' }}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 13, color: isBlocked ? '#059669' : '#EF4444' }}>
                      {isBlocked ? '🟢 Reactivar cuenta' : '🔴 Bloquear cuenta'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
