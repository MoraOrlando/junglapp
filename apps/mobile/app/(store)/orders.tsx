import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc, orderBy } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Order, Store } from '@junglapp/types';

const { db } = initFirebase();

const STATUS_FLOW: Record<string, { label: string; next?: string; nextLabel?: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', next: 'confirmed', nextLabel: 'Confirmar', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  confirmed: { label: 'Confirmado', next: 'shipped', nextLabel: 'Marcar enviado', color: 'text-blue-600', bg: 'bg-blue-100' },
  shipped: { label: 'Enviado', next: 'delivered', nextLabel: 'Marcar entregado', color: 'text-purple-600', bg: 'bg-purple-100' },
  delivered: { label: 'Entregado', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: 'Cancelado', color: 'text-red-500', bg: 'bg-red-100' },
};

export default function StoreOrdersScreen() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadOrders() {
    if (!user) return;
    const storeSnap = await getDocs(
      query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid))
    );
    if (storeSnap.empty) return;
    const storeId = storeSnap.docs[0].id;
    const orderSnap = await getDocs(
      query(collection(db, COLLECTIONS.ORDERS), where('storeId', '==', storeId))
    );
    const sorted = orderSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Order))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setOrders(sorted);
  }

  useEffect(() => { loadOrders(); }, [user]);

  async function onRefresh() {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }

  async function advanceStatus(order: Order) {
    const flow = STATUS_FLOW[order.status];
    if (!flow.next) return;
    await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), { status: flow.next });
    setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: flow.next as Order['status'] } : o));
  }

  const totalRevenue = orders
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-amber-700 mb-3">Pedidos 🛍️</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 bg-amber-50 rounded-2xl p-3">
            <Text className="text-amber-600 text-2xl font-bold">{orders.length}</Text>
            <Text className="text-gray-500 text-xs">Total pedidos</Text>
          </View>
          <View className="flex-1 bg-green-50 rounded-2xl p-3">
            <Text className="text-green-600 text-2xl font-bold">${totalRevenue.toLocaleString()}</Text>
            <Text className="text-gray-500 text-xs">Ventas completadas</Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-6 mt-2"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D97706" />}
      >
        {orders.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-5xl mb-3">🛍️</Text>
            <Text className="text-gray-500">Sin pedidos aún</Text>
          </View>
        ) : (
          <View className="gap-3 pb-6">
            {orders.map((order) => {
              const status = STATUS_FLOW[order.status];
              return (
                <View key={order.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <View className="flex-row justify-between items-start mb-2">
                    <View>
                      <Text className="font-bold text-gray-800">Pedido #{order.id.slice(0, 6)}</Text>
                      <Text className="text-gray-400 text-xs">
                        {new Date(order.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <View className={`${status.bg} rounded-full px-3 py-1`}>
                      <Text className={`text-xs font-medium ${status.color}`}>{status.label}</Text>
                    </View>
                  </View>

                  {order.products.map((item, i) => (
                    <View key={i} className="flex-row justify-between py-1">
                      <Text className="text-gray-600 text-sm">{item.quantity}x {item.productName}</Text>
                      <Text className="text-gray-600 text-sm">${(item.price * item.quantity).toLocaleString()}</Text>
                    </View>
                  ))}

                  <View className="flex-row justify-between pt-2 mt-2 border-t border-gray-50">
                    <Text className="font-semibold text-gray-800">Total</Text>
                    <Text className="font-bold text-primary-600">${order.total.toLocaleString()}</Text>
                  </View>

                  <Text className="text-gray-400 text-xs mt-2">📍 {order.shippingAddress}</Text>

                  {status.next && (
                    <TouchableOpacity
                      className="bg-amber-500 rounded-xl py-2.5 items-center mt-3"
                      onPress={() => advanceStatus(order)}
                    >
                      <Text className="text-white font-medium text-sm">{status.nextLabel}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
