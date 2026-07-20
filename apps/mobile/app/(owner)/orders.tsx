import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
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

const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;

function isRecentlyDelivered(order: { status: string; updatedAt?: string }): boolean {
  if (order.status !== 'delivered') return false;
  if (!order.updatedAt) return false; // no timestamp captured before this feature shipped — treat as stale
  return Date.now() - new Date(order.updatedAt).getTime() <= FOUR_DAYS_MS;
}

interface OrderWithStore {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  total: number;
  shippingAddress: string;
  products?: Array<{ productName: string; quantity: number; price: number; photoUrl?: string }>;
  service?: { serviceName: string; price: number; note?: string };
  type?: string;
  storeId: string;
  storeName?: string;
  storePhone?: string;
  alternativeMessage?: string;
}

export default function OwnerOrdersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderWithStore[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadOrders() {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.ORDERS), where('buyerId', '==', user.uid))
    );
    const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    // Load store names in parallel
    const storeIds = [...new Set(raw.map((o: any) => o.storeId as string))];
    const storeMap: Record<string, any> = {};
    await Promise.all(
      storeIds.map(async (sid) => {
        const sDoc = await getDoc(doc(db, COLLECTIONS.STORES, sid));
        if (sDoc.exists()) storeMap[sid] = sDoc.data();
      })
    );

    const enriched: OrderWithStore[] = raw
      .map((o: any) => ({
        ...o,
        storeName: storeMap[o.storeId]?.name ?? 'Tienda',
        storePhone: storeMap[o.storeId]?.phone ?? null,
      }))
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

    setOrders(enriched);
  }

  useFocusEffect(useCallback(() => { loadOrders(); }, [user?.uid]));

  async function onRefresh() {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }

  async function openStoreChat(order: OrderWithStore) {
    // Find store's userId
    const storeDoc = await getDoc(doc(db, COLLECTIONS.STORES, order.storeId));
    if (!storeDoc.exists()) return;
    const storeUserId = storeDoc.data()?.userId;
    if (!user || !storeUserId) return;

    // Look for existing store chat
    const existingSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.CHATS),
        where('participants', 'array-contains', user.uid),
        where('chatType', '==', 'store'),
      )
    );
    const existing = existingSnap.docs.find((d) => {
      const parts = d.data().participants as string[];
      return parts.includes(storeUserId);
    });

    if (existing) {
      router.push(`/(owner)/chat/${existing.id}` as any);
      return;
    }

    // Create new store chat
    const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
      participants: [user.uid, storeUserId],
      participantNames: { [user.uid]: user.name || 'Dueño', [storeUserId]: order.storeName || 'Tienda' },
      chatType: 'store',
      orderId: order.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    router.push(`/(owner)/chat/${chatRef.id}` as any);
  }

  async function cancelOrder(order: OrderWithStore) {
    Alert.alert(
      'Cancelar pedido',
      '¿Estás seguro/a de que deseas cancelar este pedido?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setUpdatingId(order.id);
            try {
              await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), {
                status: 'cancelled',
                cancelledBy: 'buyer',
                updatedAt: new Date().toISOString(),
              });
              setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'cancelled' } : o));
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  }

  async function acceptAlternative(order: OrderWithStore) {
    setUpdatingId(order.id);
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), {
        status: 'confirmed',
        updatedAt: new Date().toISOString(),
      });
      setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'confirmed' } : o));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUpdatingId(null);
    }
  }

  const pending = orders.filter((o) => o.status === 'pending' || o.status === 'alternative_offered');
  const active = orders.filter((o) => o.status === 'confirmed' || o.status === 'shipped');
  const done = orders.filter((o) => isRecentlyDelivered(o));

  function OrderCard({ order }: { order: OrderWithStore }) {
    const info = STATUS_INFO[order.status] ?? STATUS_INFO.pending;
    const isService = order.type === 'service';
    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F3F4F6', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View>
            <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{order.storeName}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
              {new Date(order.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={{ backgroundColor: info.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12 }}>{info.emoji}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: info.color }}>{info.label}</Text>
          </View>
        </View>

        {/* Products */}
        {isService && order.service ? (
          <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <Text style={{ fontWeight: '600', color: '#374151', fontSize: 14 }}>🔧 {order.service.serviceName}</Text>
            {order.service.note ? <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{order.service.note}</Text> : null}
          </View>
        ) : (
          (order.products ?? []).map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>🛍️</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '500', color: '#374151', fontSize: 13 }}>{item.productName}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{item.quantity}x ${item.price.toLocaleString('es-CL')}</Text>
              </View>
            </View>
          ))
        )}

        {/* Address */}
        {order.shippingAddress ? (
          <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 8 }}>📍 {order.shippingAddress}</Text>
        ) : null}

        {/* Alternative message */}
        {order.status === 'alternative_offered' && order.alternativeMessage ? (
          <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A' }}>
            <Text style={{ fontWeight: '700', color: '#D97706', fontSize: 12, marginBottom: 2 }}>La tienda ofrece una alternativa:</Text>
            <Text style={{ color: '#374151', fontSize: 13 }}>{order.alternativeMessage}</Text>
          </View>
        ) : null}

        {/* Buyer actions: respond to an alternative offer */}
        {order.status === 'alternative_offered' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => acceptAlternative(order)}
              disabled={updatingId === order.id}
              style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 10, alignItems: 'center', opacity: updatingId === order.id ? 0.6 : 1 }}
            >
              <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>✅ Aceptar alternativa</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => cancelOrder(order)}
              disabled={updatingId === order.id}
              style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 10, alignItems: 'center', opacity: updatingId === order.id ? 0.6 : 1 }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>❌ Rechazar y cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Buyer actions: edit or cancel a pending order */}
        {order.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {!isService && (
              <TouchableOpacity
                onPress={() => router.push(`/(owner)/order-edit/${order.id}` as any)}
                style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 13 }}>✏️ Editar pedido</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => cancelOrder(order)}
              disabled={updatingId === order.id}
              style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 10, alignItems: 'center', opacity: updatingId === order.id ? 0.6 : 1 }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>
                {updatingId === order.id ? 'Cancelando...' : '❌ Cancelar pedido'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Total */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>Total: ${order.total.toLocaleString('es-CL')}</Text>
          {order.storePhone ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.storePhone}`)}>
              <Text style={{ color: '#2563EB', fontSize: 12, fontWeight: '600' }}>📞 Llamar</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Chat button */}
        <TouchableOpacity
          onPress={() => openStoreChat(order)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 16 }}>💬</Text>
          <Text style={{ color: '#2563EB', fontWeight: '600', fontSize: 14 }}>Chat con la tienda</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function Section({ title, data }: { title: string; data: OrderWithStore[] }) {
    if (data.length === 0) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontWeight: '700', color: '#374151', fontSize: 14, marginBottom: 10 }}>{title}</Text>
        <View style={{ gap: 10 }}>
          {data.map((o) => <OrderCard key={o.id} order={o} />)}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1F2937' }}>Mis Pedidos 🛍️</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>Seguimiento de tus compras</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(owner)/historial' as any)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Text style={{ fontSize: 14 }}>📜</Text>
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 12 }}>Histórico</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
        showsVerticalScrollIndicator={false}
      >
        {orders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🛍️</Text>
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 16, marginBottom: 4 }}>Sin pedidos aún</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>
              Visita una tienda en "Cerca" para realizar tu primera compra
            </Text>
          </View>
        ) : (
          <>
            <Section title="⏳ En proceso" data={pending} />
            <Section title="🚚 Activos" data={active} />
            <Section title="🎉 Entregados recientemente" data={done} />
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
