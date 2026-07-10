import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, getDoc, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { ContentReport, User } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

const ACCOUNT_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: '#ECFDF5', text: '#059669', label: 'Activo' },
  under_review: { bg: '#FFFBEB', text: '#D97706', label: 'En revisión' },
  blocked: { bg: '#FEF2F2', text: '#EF4444', label: 'Bloqueado' },
};

export default function ReportsAdminScreen() {
  const { user: admin } = useAuth();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [usersById, setUsersById] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'reviewed' | 'all'>('pending');

  async function loadReports() {
    const snap = await getDocs(collection(db, COLLECTIONS.REPORTS));
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContentReport));
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    setReports(all);

    const ids = new Set<string>();
    all.forEach((r) => { ids.add(r.reporterId); ids.add(r.reportedUserId); });
    const entries = await Promise.all(
      Array.from(ids).map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
          return snap.exists() ? [uid, { uid, ...snap.data() } as User] as const : null;
        } catch {
          return null;
        }
      })
    );
    const map: Record<string, User> = {};
    entries.forEach((e) => { if (e) map[e[0]] = e[1]; });
    setUsersById(map);
  }

  useEffect(() => { loadReports().finally(() => setLoading(false)); }, []);
  async function onRefresh() { setRefreshing(true); await loadReports(); setRefreshing(false); }

  async function resolveReport(report: ContentReport, resolution: 'blocked' | 'dismissed') {
    const label = resolution === 'blocked' ? 'bloquear la cuenta' : 'mantener la cuenta activa';
    Alert.alert('Confirmar', `¿Deseas ${label} de ${report.reportedUserName || report.reportedUserId}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: resolution === 'blocked' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await updateDoc(doc(db, COLLECTIONS.USERS, report.reportedUserId), {
              accountStatus: resolution === 'blocked' ? 'blocked' : 'active',
            });
            await updateDoc(doc(db, COLLECTIONS.REPORTS, report.id), {
              status: 'reviewed',
              resolution,
              resolvedAt: new Date().toISOString(),
              resolvedBy: admin?.uid ?? null,
            });
            setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: 'reviewed', resolution } : r));
            setUsersById((prev) => prev[report.reportedUserId]
              ? { ...prev, [report.reportedUserId]: { ...prev[report.reportedUserId], accountStatus: resolution === 'blocked' ? 'blocked' : 'active' } }
              : prev);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 12 }}>🚩 Reportes ({reports.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['pending', 'reviewed', 'all'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={{ backgroundColor: filter === f ? PURPLE : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: filter === f ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: filter === f ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>{f === 'pending' ? 'Pendientes' : f === 'reviewed' ? 'Revisados' : 'Todos'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {filtered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🚩</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No hay reportes {filter === 'pending' ? 'pendientes' : ''}</Text>
          </View>
        )}
        {filtered.map((r) => {
          const reportedUser = usersById[r.reportedUserId];
          const reporterUser = usersById[r.reporterId];
          const accountStatus = reportedUser?.accountStatus || 'active';
          const sc = ACCOUNT_STATUS_COLORS[accountStatus] || ACCOUNT_STATUS_COLORS.active;
          return (
            <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>
                    {r.reportedUserName || reportedUser?.name || r.reportedUserId}
                  </Text>
                  <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{reportedUser?.email}</Text>
                </View>
                <View style={{ backgroundColor: sc.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: sc.text, fontSize: 11, fontWeight: '600' }}>{sc.label}</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <Text style={{ color: '#374151', fontSize: 13 }}>{r.reason}</Text>
              </View>

              <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                Reportado por {reporterUser?.name || r.reporterId} · {new Date(r.createdAt).toLocaleDateString('es-CL')}
              </Text>
              {r.status === 'reviewed' && r.resolution && (
                <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>
                  Resolución: {r.resolution === 'blocked' ? 'Cuenta bloqueada' : 'Se mantuvo activa'}
                </Text>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity onPress={() => resolveReport(r, 'dismissed')} style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#059669', fontWeight: '700' }}>✅ Mantener activa</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => resolveReport(r, 'blocked')} style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ color: '#EF4444', fontWeight: '700' }}>🚫 Bloquear cuenta</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
