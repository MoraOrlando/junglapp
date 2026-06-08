import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Trainer } from '@junglapp/types';

const { db } = initFirebase();
const INDIGO = '#4F46E5';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: '⏳ Pendiente',  color: '#D97706', bg: '#FFFBEB' },
  confirmed: { label: '✅ Confirmada', color: '#059669', bg: '#ECFDF5' },
  completed: { label: '🏆 Completada', color: '#6B7280', bg: '#F3F4F6' },
  cancelled: { label: '❌ Cancelada',  color: '#EF4444', bg: '#FEF2F2' },
};

export default function TrainerSessionsScreen() {
  const { user, logOut } = useAuth();
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    const tSnap = await getDocs(query(collection(db, COLLECTIONS.TRAINERS), where('userId', '==', user.uid)));
    if (tSnap.empty) return;
    const t = { id: tSnap.docs[0].id, ...tSnap.docs[0].data() } as Trainer;
    setTrainer(t);
    // Load training sessions (stored as appointments with type='training')
    const sSnap = await getDocs(query(collection(db, COLLECTIONS.APPOINTMENTS), where('vetId', '==', t.id)));
    const all = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    all.sort((a: any, b: any) => b.createdAt?.localeCompare(a.createdAt));
    setSessions(all);
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  async function onRefresh() { setRefreshing(true); await loadData(); setRefreshing(false); }

  if (trainer?.status === 'pending') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#374151', textAlign: 'center' }}>Perfil en revisión</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          Estamos validando tu información y documentos. Te avisaremos cuando esté aprobado.
        </Text>
        <TouchableOpacity style={{ marginTop: 24, backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }} onPress={logOut}>
          <Text style={{ color: '#6B7280' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ backgroundColor: INDIGO, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Adiestrador</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{trainer?.name || 'Cargando...'} 🐕</Text>
          </View>
          <TouchableOpacity style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }} onPress={logOut}>
            <Text style={{ color: '#fff', fontSize: 13 }}>Salir</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{sessions.length}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Sesiones</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>⭐ {trainer?.rating?.toFixed(1) || '—'}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Valoración</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 20, marginBottom: 12 }}>Próximas sesiones</Text>
        {sessions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 48 }}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🐾</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 14 }}>Sin sesiones agendadas aún</Text>
          </View>
        ) : (
          <View style={{ gap: 12, paddingBottom: 32 }}>
            {sessions.map((s: any) => {
              const st = STATUS_LABEL[s.status] || STATUS_LABEL.pending;
              return (
                <View key={s.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{s.date} · {s.time}</Text>
                      <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{s.reason || 'Sesión de adiestramiento'}</Text>
                    </View>
                    <View style={{ backgroundColor: st.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: st.color, fontSize: 11, fontWeight: '600' }}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
