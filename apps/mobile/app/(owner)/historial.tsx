import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';

const { db } = initFirebase();

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  pending:            { label: 'Pendiente',        color: '#D97706', bg: '#FFFBEB', emoji: '⏳' },
  confirmed:          { label: 'Confirmado',        color: '#2563EB', bg: '#EFF6FF', emoji: '✅' },
  shipped:            { label: 'En camino',         color: '#7C3AED', bg: '#F5F3FF', emoji: '🚚' },
  delivered:          { label: 'Entregado',         color: '#059669', bg: '#ECFDF5', emoji: '🎉' },
  cancelled:          { label: 'Cancelado',         color: '#EF4444', bg: '#FEF2F2', emoji: '❌' },
  alternative_offered:{ label: 'Oferta alternativa',color: '#D97706', bg: '#FFFBEB', emoji: '🔄' },
};

interface OrderWithStore {
  id: string;
  status: string;
  createdAt: string;
  total: number;
  products?: Array<{ productName: string; quantity: number; price: number }>;
  service?: { serviceName: string };
  type?: string;
  storeId: string;
  storeName?: string;
}

export default function OwnerHistorialScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderWithStore[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyCancelled, setOnlyCancelled] = useState(false);

  async function loadOrders() {
    if (!user) return;
    const snap = await getDocs(query(collection(db, COLLECTIONS.ORDERS), where('buyerId', '==', user.uid)));
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    const storeIds = [...new Set(raw.map((o: any) => o.storeId as string))];
    const storeMap: Record<string, any> = {};
    await Promise.all(
      storeIds.map(async (sid) => {
        const sDoc = await getDoc(doc(db, COLLECTIONS.STORES, sid));
        if (sDoc.exists()) storeMap[sid] = sDoc.data();
      })
    );

    const enriched: OrderWithStore[] = raw
      .map((o: any) => ({ ...o, storeName: storeMap[o.storeId]?.name ?? 'Tienda' }))
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

    setOrders(enriched);
  }

  useFocusEffect(useCallback(() => { loadOrders(); }, [user?.uid]));

  async function onRefresh() {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }

  const visible = onlyCancelled ? orders.filter((o) => o.status === 'cancelled') : orders;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: '#6B7280' }}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>Histórico 📜</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }}>Todos tus pedidos</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingBottom: 12 }}>
        <TouchableOpacity
          onPress={() => setOnlyCancelled(false)}
          style={{ backgroundColor: !onlyCancelled ? '#1F2937' : '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: !onlyCancelled ? '#fff' : '#374151', fontWeight: '600', fontSize: 12 }}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setOnlyCancelled(true)}
          style={{ backgroundColor: onlyCancelled ? '#EF4444' : '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
        >
          <Text style={{ color: onlyCancelled ? '#fff' : '#374151', fontWeight: '600', fontSize: 12 }}>❌ Cancelados</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
        showsVerticalScrollIndicator={false}
      >
        {visible.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📜</Text>
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 16 }}>
              {onlyCancelled ? 'No tienes pedidos cancelados.' : 'Todavía no hay historial.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {visible.map((order) => {
              const info = STATUS_INFO[order.status] ?? STATUS_INFO.pending;
              const isService = order.type === 'service';
              return (
                <View
                  key={order.id}
                  style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F3F4F6' }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14 }}>{order.storeName}</Text>
                    <View style={{ backgroundColor: info.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 11 }}>{info.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: info.color }}>{info.label}</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 4 }}>
                    {new Date(order.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>
                    {isService && order.service ? order.service.serviceName : `${(order.products ?? []).length} producto(s)`}
                  </Text>
                  <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14, marginTop: 6 }}>
                    Total: ${order.total.toLocaleString('es-CL')}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
