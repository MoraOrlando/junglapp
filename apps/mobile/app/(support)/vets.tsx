import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Veterinarian } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: '#ECFDF5', text: '#059669', label: '✅ Aprobado' },
  pending:  { bg: '#FFFBEB', text: '#D97706', label: '⏳ Pendiente' },
  rejected: { bg: '#FEF2F2', text: '#EF4444', label: '❌ Rechazado' },
};

function RejectModal({ visible, onConfirm, onCancel }: { visible: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: '#1F2937', marginBottom: 8 }}>❌ Rechazar veterinario</Text>
          <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Indica el motivo del rechazo. El veterinario recibirá esta información.</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 }}
            placeholder="Ej: Credencial no válida, datos incompletos..."
            placeholderTextColor="#9CA3AF"
            multiline
            value={reason}
            onChangeText={setReason}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={onCancel} style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#374151', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { if (!reason.trim()) { Alert.alert('', 'Ingresa un motivo de rechazo'); return; } onConfirm(reason.trim()); setReason(''); }}
              style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>Rechazar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function VetsAdminScreen() {
  const [vets, setVets] = useState<Veterinarian[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  async function loadVets() {
    const snap = await getDocs(collection(db, COLLECTIONS.VETERINARIANS));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Veterinarian));
    all.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    setVets(all);
  }

  useEffect(() => { loadVets().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadVets(); setRefreshing(false); }

  async function approve(id: string) {
    Alert.alert('Confirmar', '¿Aprobar este veterinario?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aprobar', onPress: async () => {
        await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, id), { status: 'approved', rejectionReason: null });
        setVets((prev) => prev.map((v) => v.id === id ? { ...v, status: 'approved' } : v));
      }},
    ]);
  }

  async function rejectWithReason(id: string, reason: string) {
    await updateDoc(doc(db, COLLECTIONS.VETERINARIANS, id), { status: 'rejected', rejectionReason: reason });
    setVets((prev) => prev.map((v) => v.id === id ? { ...v, status: 'rejected' } : v));
    setRejectTarget(null);
  }

  const filtered = filter === 'all' ? vets : vets.filter((v) => v.status === filter);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 12 }}>🩺 Veterinarios ({vets.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={{ backgroundColor: filter === f ? PURPLE : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: filter === f ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: filter === f ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>{f === 'all' ? 'Todos' : f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobados' : 'Rechazados'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {filtered.map((v) => {
          const sc = STATUS_COLORS[v.status] || STATUS_COLORS.pending;
          return (
            <View key={v.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, flex: 1 }}>{v.name}</Text>
                <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: sc.text, fontSize: 11, fontWeight: '600' }}>{sc.label}</Text>
                </View>
              </View>
              <Text style={{ color: '#9CA3AF', fontSize: 12 }}>🪪 {v.rut} · 📋 {v.licenseNumber}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📍 {v.address}</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>📧 {v.email}</Text>
              {v.credentialUrl && (
                <Text style={{ color: PURPLE, fontSize: 12, marginTop: 4 }}>🔗 Credencial cargada</Text>
              )}
              {(v as any).rejectionReason && (
                <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>Motivo: {(v as any).rejectionReason}</Text>
              )}
              {v.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity onPress={() => approve(v.id)} style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontWeight: '700' }}>✅ Aprobar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setRejectTarget(v.id)} style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#EF4444', fontWeight: '700' }}>❌ Rechazar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {v.status !== 'pending' && (
                <TouchableOpacity onPress={() => v.status === 'approved' ? setRejectTarget(v.id) : approve(v.id)} style={{ marginTop: 10, backgroundColor: '#F3F4F6', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#374151', fontSize: 13 }}>{v.status === 'approved' ? '❌ Revocar aprobación' : '✅ Reactivar'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>

      <RejectModal
        visible={rejectTarget !== null}
        onConfirm={(reason) => rejectTarget && rejectWithReason(rejectTarget, reason)}
        onCancel={() => setRejectTarget(null)}
      />
    </SafeAreaView>
  );
}
