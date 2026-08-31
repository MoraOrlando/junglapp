import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';
const NEW_ACCOUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isNewAccount(createdAt?: string) {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < NEW_ACCOUNT_WINDOW_MS;
}

// "3 sept" style — short enough for a card, no year (support only cares
// about recency, not the exact historical date).
function formatShortDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

const ACCOUNT_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#ECFDF5', text: '#059669', label: 'Activo' },
  under_review: { bg: '#FFFBEB', text: '#D97706', label: 'En revisión' },
  blocked: { bg: '#FEF2F2', text: '#EF4444', label: 'Bloqueado' },
};

type TabType = 'users' | 'providers';
type SortMode = 'name' | 'recent';

interface Provider { id: string; name: string; email: string; type: string; status: string; address?: string; createdAt?: string; }

export default function UsersScreen() {
  const router = useRouter();
  const { sort: sortParam } = useLocalSearchParams<{ sort?: string }>();
  // Arriving from the dashboard's "Cuentas nuevas" card (?sort=recent) means
  // "show me every new account regardless of role" — the Usuarios tab covers
  // every role (owners + all provider types all get a users/{uid} doc at
  // signup), while Cuentas is scoped to just vets/stores.
  const [tab, setTab] = useState<TabType>(sortParam === 'recent' ? 'users' : 'providers');
  const [sortMode, setSortMode] = useState<SortMode>(sortParam === 'recent' ? 'recent' : 'name');
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
    setUsers(usersSnap.docs.map((d) => ({ ...d.data() } as User)));
    const vets: Provider[] = vetsSnap.docs.map((d) => ({ id: d.id, type: 'vet', ...d.data() } as any));
    const stores: Provider[] = storesSnap.docs.map((d) => ({ id: d.id, type: 'store', ...d.data() } as any));
    setProviders([...vets, ...stores]);
  }

  function sortByMode<T extends { name?: string; createdAt?: string }>(list: T[]): T[] {
    return [...list].sort((a, b) => (
      sortMode === 'recent'
        ? (b.createdAt || '').localeCompare(a.createdAt || '')
        : (a.name || '').localeCompare(b.name || '')
    ));
  }

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

  const lowerSearch = search.toLowerCase();
  const filteredUsers = sortByMode(users.filter((u) => !search || u.name?.toLowerCase().includes(lowerSearch) || u.email?.toLowerCase().includes(lowerSearch)));
  const filteredProviders = sortByMode(providers.filter((p) => !search || p.name?.toLowerCase().includes(lowerSearch) || p.email?.toLowerCase().includes(lowerSearch)));

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

        <View style={{ backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 10 }}>
          <Text style={{ color: '#9CA3AF', marginRight: 8 }}>🔍</Text>
          <TextInput style={{ flex: 1, paddingVertical: 12, fontSize: 14 }} placeholder="Buscar por nombre o correo..." value={search} onChangeText={setSearch} />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: '#9CA3AF', fontSize: 18 }}>✕</Text></TouchableOpacity>}
        </View>

        {/* Sort toggle */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['name', 'Nombre'], ['recent', '🆕 Más recientes']] as const).map(([m, label]) => (
            <TouchableOpacity
              key={m}
              onPress={() => setSortMode(m)}
              style={{ borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: sortMode === m ? PURPLE : '#E5E7EB', backgroundColor: sortMode === m ? '#EEF2FF' : '#fff' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: sortMode === m ? PURPLE : '#6B7280' }}>{label}</Text>
            </TouchableOpacity>
          ))}
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
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={p.type === 'vet' ? 0.7 : 1}
                  onPress={() => { if (p.type === 'vet') router.push(`/(support)/vets/${p.id}` as any); }}
                  style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', opacity: isActive ? 1 : 0.65 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{p.name}</Text>
                        {isNewAccount(p.createdAt) && (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ color: '#16A34A', fontSize: 10, fontWeight: '700' }}>🆕 Nuevo</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{p.email}</Text>
                      {p.address && <Text style={{ color: '#9CA3AF', fontSize: 12 }}>📍 {p.address}</Text>}
                      {!!p.createdAt && <Text style={{ color: '#C4B5FD', fontSize: 11, marginTop: 2 }}>Creada el {formatShortDate(p.createdAt)}</Text>}
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
                </TouchableOpacity>
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
                <TouchableOpacity
                  key={u.uid}
                  onPress={() => router.push(`/(support)/users/${u.uid}` as any)}
                  style={{ backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', opacity: isBlocked ? 0.65 : 1 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{u.name}</Text>
                        {isNewAccount(u.createdAt) && (
                          <View style={{ backgroundColor: '#DCFCE7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ color: '#16A34A', fontSize: 10, fontWeight: '700' }}>🆕 Nuevo</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{u.email}</Text>
                      {!!u.createdAt && <Text style={{ color: '#C4B5FD', fontSize: 11, marginTop: 2 }}>Creada el {formatShortDate(u.createdAt)}</Text>}
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
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
