import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Store } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: '#ECFDF5', text: '#059669', label: '✅ Aprobada' },
  pending:  { bg: '#FFFBEB', text: '#D97706', label: '⏳ Pendiente' },
  rejected: { bg: '#FEF2F2', text: '#EF4444', label: '❌ Rechazada' },
};

export default function StoresAdminScreen() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  async function loadStores() {
    const snap = await getDocs(collection(db, COLLECTIONS.STORES));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Store));
    all.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    setStores(all);
  }

  useEffect(() => { loadStores().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadStores(); setRefreshing(false); }

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    const label = status === 'approved' ? 'aprobar' : 'rechazar';
    Alert.alert('Confirmar', `¿Deseas ${label} esta tienda?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí', onPress: async () => {
          await updateDoc(doc(db, COLLECTIONS.STORES, id), { status });
          setStores((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
        }
      }
    ]);
  }

  const filtered = filter === 'all' ? stores : stores.filter((s) => s.status === filter);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 12 }}>🛒 Tiendas ({stores.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={{ backgroundColor: filter === f ? PURPLE : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: filter === f ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: filter === f ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>{f === 'all' ? 'Todas' : f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobadas' : 'Rechazadas'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {filtered.map((s) => {
          const sc = STATUS_COLORS[s.status] || STATUS_COLORS.pending;
          return (
            <View key={s.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, flex: 1 }}>{s.name}</Text>
                <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: sc.text, fontSize: 11, fontWeight: '600' }}>{sc.label}</Text>
                </View>
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12 }}>🏷️ {(s as any).rut || 'Sin RUT'} · {s.category}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📍 {s.address}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📧 {(s as any).email || '—'}</Text>
              {s.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => setStatus(s.id, 'approved')} style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontWeight: '700' }}>✅ Aprobar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStatus(s.id, 'rejected')} style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>❌ Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {s.status !== 'pending' && (
                <TouchableOpacity onPress={() => setStatus(s.id, s.status === 'approved' ? 'rejected' : 'approved')} style={{ marginTop: 10, backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#374151', fontSize: 13 }}>{s.status === 'approved' ? '❌ Revocar' : '✅ Reactivar'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
