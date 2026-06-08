import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { User } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño 🐾', vet: 'Veterinario 🩺', store: 'Tienda 🛒',
  trainer: 'Adiestrador 🐕', support: 'Admin 🛡️', walker: 'Paseador 🦮',
};

export default function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadUsers() {
    const snap = await getDocs(collection(db, COLLECTIONS.USERS));
    const all = snap.docs.map((d) => ({ ...d.data() } as User));
    all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setUsers(all);
    setFiltered(all);
  }

  useEffect(() => { loadUsers().finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (!search) { setFiltered(users); return; }
    const lower = search.toLowerCase();
    setFiltered(users.filter((u) => u.name?.toLowerCase().includes(lower) || u.email?.toLowerCase().includes(lower)));
  }, [search, users]);

  async function onRefresh() { setRefreshing(true); await loadUsers(); setRefreshing(false); }

  async function changeRole(uid: string, newRole: string) {
    Alert.alert('Cambiar rol', `¿Cambiar a ${ROLE_LABELS[newRole] || newRole}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar', onPress: async () => {
          await updateDoc(doc(db, COLLECTIONS.USERS, uid), { role: newRole });
          setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, role: newRole as any } : u));
        }
      }
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
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 12 }}>👥 Usuarios ({users.length})</Text>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB' }}>
          <Text style={{ color: '#9CA3AF', marginRight: 8 }}>🔍</Text>
          <TextInput style={{ flex: 1, paddingVertical: 12, fontSize: 14 }} placeholder="Buscar por nombre o correo..." value={search} onChangeText={setSearch} />
        </View>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {filtered.map((u) => (
          <View key={u.uid} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{u.name}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{u.email}</Text>
              </View>
              <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: PURPLE, fontSize: 11, fontWeight: '600' }}>{ROLE_LABELS[u.role] || u.role}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {['owner', 'vet', 'store', 'trainer', 'support'].filter((r) => r !== u.role).map((r) => (
                <TouchableOpacity key={r} onPress={() => changeRole(u.uid, r)} style={{ backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: '#374151', fontSize: 11 }}>→ {r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
