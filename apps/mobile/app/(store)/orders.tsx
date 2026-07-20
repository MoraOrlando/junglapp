import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert,
  Modal, TextInput, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  collection, query, where, getDocs, doc, updateDoc, addDoc, getDoc
} from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Order } from '@junglapp/types';

const { db } = initFirebase();

const STATUS_INFO: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  pending:             { label: 'Pendiente',         color: '#D97706', bg: '#FFFBEB', emoji: '⏳' },
  confirmed:           { label: 'Confirmado',         color: '#2563EB', bg: '#EFF6FF', emoji: '✅' },
  shipped:             { label: 'Enviado',            color: '#7C3AED', bg: '#F5F3FF', emoji: '🚚' },
  delivered:           { label: 'Entregado',          color: '#059669', bg: '#ECFDF5', emoji: '🎉' },
  cancelled:           { label: 'Cancelado',          color: '#EF4444', bg: '#FEF2F2', emoji: '❌' },
  alternative_offered: { label: 'Alternativa enviada',color: '#D97706', bg: '#FFFBEB', emoji: '🔄' },
};

export default function StoreOrdersScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [altOrder, setAltOrder] = useState<Order | null>(null);
  const [altMessage, setAltMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function loadOrders() {
    if (!user) return;
    const storeSnap = await getDocs(
      query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid))
    );
    if (storeSnap.empty) return;
    const sid = storeSnap.docs[0].id;
    setStoreId(sid);
    const orderSnap = await getDocs(
      query(collection(db, COLLECTIONS.ORDERS), where('storeId', '==', sid))
    );
    const sorted = orderSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Order))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setOrders(sorted);
  }

  useFocusEffect(useCallback(() => { loadOrders(); }, [user?.uid]));

  async function onRefresh() { setRefreshing(true); await loadOrders(); setRefreshing(false); }

  async function setStatus(order: Order, status: string) {
    await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), { status, updatedAt: new Date().toISOString() });
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: status as any } : o));
  }

  async function sendAlternative() {
    if (!altOrder || !altMessage.trim()) return;
    setSending(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, altOrder.id), {
        status: 'alternative_offered',
        alternativeMessage: altMessage.trim(),
      });
      setOrders((prev) => prev.map((o) =>
        o.id === altOrder.id ? { ...o, status: 'alternative_offered' as any, alternativeMessage: altMessage.trim() } : o
      ));
      setAltOrder(null);
      setAltMessage('');
    } finally {
      setSending(false);
    }
  }

  async function openChatWithBuyer(order: Order) {
    if (!user || !storeId) return;
    const buyerId = (order as any).buyerId;
    if (!buyerId) return;

    const buyerName = (order as any).buyerName || 'Cliente';
    const storeSnap = await getDoc(doc(db, COLLECTIONS.STORES, storeId));
    const storeName = storeSnap.data()?.name || 'Tienda';

    // Find existing chat
    const existingSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.CHATS),
        where('participants', 'array-contains', user.uid),
        where('chatType', '==', 'store'),
      )
    );
    const existing = existingSnap.docs.find((d) => {
      return (d.data().participants as string[]).includes(buyerId);
    });

    if (existing) {
      router.push(`/(store)/chat/${existing.id}` as any);
      return;
    }

    const chatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
      participants: [user.uid, buyerId],
      participantNames: { [user.uid]: storeName, [buyerId]: buyerName },
      chatType: 'store',
      orderId: order.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    router.push(`/(store)/chat/${chatRef.id}` as any);
  }

  const totalRevenue = orders
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

  const pending = orders.filter((o) => o.status === 'pending');
  const active = orders.filter((o) => ['confirmed', 'shipped', 'alternative_offered'].includes(o.status));
  const done = orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));

  function OrderCard({ order }: { order: Order }) {
    const info = STATUS_INFO[order.status] ?? STATUS_INFO.pending;
    const buyerName = (order as any).buyerName;
    const buyerPhone = (order as any).buyerPhone;
    const altMsg = (order as any).alternativeMessage;
    const isService = (order as any).type === 'service';

    return (
      <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 10 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>
              Pedido #{order.id.slice(0, 6).toUpperCase()}
            </Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
              {new Date(order.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={{ backgroundColor: info.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12 }}>{info.emoji}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: info.color }}>{info.label}</Text>
          </View>
        </View>

        {/* Buyer info */}
        {(buyerName || buyerPhone) && (
          <View style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontWeight: '600', color: '#374151', fontSize: 13, marginBottom: 2 }}>👤 Comprador</Text>
            {buyerName ? <Text style={{ color: '#6B7280', fontSize: 13 }}>Nombre: {buyerName}</Text> : null}
            {buyerPhone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${buyerPhone}`)}>
                <Text style={{ color: '#2563EB', fontSize: 13 }}>📞 {buyerPhone}</Text>
              </TouchableOpacity>
            ) : null}
            {order.shippingAddress ? <Text style={{ color: '#6B7280', fontSize: 13 }}>📍 {order.shippingAddress}</Text> : null}
          </View>
        )}

        {/* Products / Service */}
        {isService && (order as any).service ? (
          <View style={{ marginBottom: 8 }}>
            <Text style={{ fontWeight: '500', color: '#374151', fontSize: 13 }}>🔧 {(order as any).service.serviceName}</Text>
            {(order as any).service.note ? <Text style={{ color: '#6B7280', fontSize: 12 }}>{(order as any).service.note}</Text> : null}
          </View>
        ) : (
          (order.products ?? []).map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#374151', fontSize: 13 }}>{item.quantity}x {item.productName}</Text>
              <Text style={{ color: '#6B7280', fontSize: 13 }}>${(item.price * item.quantity).toLocaleString('es-CL')}</Text>
            </View>
          ))
        )}

        {/* Alternative message */}
        {altMsg && (
          <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
            <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '600' }}>Tu oferta alternativa:</Text>
            <Text style={{ color: '#374151', fontSize: 13 }}>{altMsg}</Text>
          </View>
        )}

        {/* Total */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937' }}>Total</Text>
          <Text style={{ fontWeight: '700', color: '#D97706' }}>${order.total.toLocaleString('es-CL')}</Text>
        </View>

        {/* Actions for pending orders */}
        {order.status === 'pending' && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => Alert.alert('Aceptar pedido', '¿Confirmar este pedido?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Confirmar', onPress: () => setStatus(order, 'confirmed') },
              ])}
              style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: '#059669', fontWeight: '700', fontSize: 13 }}>✅ Aceptar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('Rechazar pedido', '¿Estás seguro de rechazar este pedido?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Rechazar', style: 'destructive', onPress: () => setStatus(order, 'cancelled') },
              ])}
              style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>❌ Rechazar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAltOrder(order); setAltMessage(''); }}
              style={{ flex: 1, backgroundColor: '#FFFBEB', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
            >
              <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 13 }}>🔄 Alternativa</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Advance status for confirmed/shipped */}
        {order.status === 'confirmed' && (
          <TouchableOpacity
            onPress={() => setStatus(order, 'shipped')}
            style={{ backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ color: '#2563EB', fontWeight: '700' }}>🚚 Marcar como enviado</Text>
          </TouchableOpacity>
        )}
        {order.status === 'shipped' && (
          <TouchableOpacity
            onPress={() => setStatus(order, 'delivered')}
            style={{ backgroundColor: '#ECFDF5', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 10 }}
          >
            <Text style={{ color: '#059669', fontWeight: '700' }}>🎉 Marcar como entregado</Text>
          </TouchableOpacity>
        )}

        {/* Chat button */}
        <TouchableOpacity
          onPress={() => openChatWithBuyer(order)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, backgroundColor: '#F3F4F6', borderRadius: 12, paddingVertical: 10 }}
        >
          <Text style={{ fontSize: 16 }}>💬</Text>
          <Text style={{ color: '#374151', fontWeight: '600', fontSize: 13 }}>Chat con el comprador</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function Section({ title, data }: { title: string; data: Order[] }) {
    if (data.length === 0) return null;
    return (
      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: '700', color: '#374151', fontSize: 14, marginBottom: 8 }}>{title}</Text>
        {data.map((o) => <OrderCard key={o.id} order={o} />)}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Stats */}
      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#D97706', marginBottom: 14 }}>Pedidos 🛍️</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 12 }}>
            <Text style={{ color: '#D97706', fontSize: 24, fontWeight: '800' }}>{orders.length}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Total pedidos</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 16, padding: 12 }}>
            <Text style={{ color: '#059669', fontSize: 20, fontWeight: '800' }}>${totalRevenue.toLocaleString('es-CL')}</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Ventas completadas</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
        showsVerticalScrollIndicator={false}
      >
        {orders.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🛍️</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 15 }}>Sin pedidos aún</Text>
          </View>
        ) : (
          <>
            <Section title="⏳ Nuevos pedidos" data={pending} />
            <Section title="🚚 En proceso" data={active} />
            <Section title="📦 Historial" data={done} />
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Alternative offer modal */}
      <Modal visible={!!altOrder} transparent animationType="slide" onRequestClose={() => setAltOrder(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} activeOpacity={1} onPress={() => setAltOrder(null)} />
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <Text style={{ fontWeight: '800', fontSize: 18, color: '#1F2937', marginBottom: 6 }}>🔄 Ofrecer alternativa</Text>
          <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 14 }}>
            Describe el producto alternativo que puedes ofrecer al comprador.
          </Text>
          <TextInput
            style={{
              borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14,
              padding: 14, fontSize: 15, color: '#1F2937',
              minHeight: 90, textAlignVertical: 'top', marginBottom: 16,
            }}
            placeholder="Ej: Tenemos el mismo producto en talla M, o el modelo 2024..."
            placeholderTextColor="#9CA3AF"
            multiline
            value={altMessage}
            onChangeText={setAltMessage}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => setAltOrder(null)}
              style={{ flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={sendAlternative}
              disabled={!altMessage.trim() || sending}
              style={{ flex: 2, backgroundColor: '#D97706', borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: !altMessage.trim() || sending ? 0.5 : 1 }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{sending ? 'Enviando...' : 'Enviar oferta'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
