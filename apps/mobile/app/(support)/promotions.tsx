import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Order, Product } from '@junglapp/types';

const { db } = initFirebase();
const PURPLE = '#7C3AED';

interface PromoProduct extends Product {
  storeName: string;
  region: string;
  soldCount: number;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function PromotionsAdminScreen() {
  const [products, setProducts] = useState<PromoProduct[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [region, setRegion] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.PRODUCTS), where('promotionStatus', 'in', ['pending', 'approved', 'rejected']))
      );
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      const storeIds = [...new Set(raw.map((p) => p.storeId))];

      const storeById = new Map<string, { name: string; region: string }>();
      await Promise.all(
        storeIds.map(async (sid) => {
          const sDoc = await getDoc(doc(db, COLLECTIONS.STORES, sid));
          if (sDoc.exists()) {
            const d = sDoc.data() as any;
            storeById.set(sid, { name: d.name ?? 'Tienda', region: d.region ?? 'Sin región' });
          }
        })
      );

      // Sales volume — sum quantity across non-cancelled orders for these stores.
      const soldByProductId = new Map<string, number>();
      if (storeIds.length > 0) {
        const ordersSnap = await getDocs(
          query(collection(db, COLLECTIONS.ORDERS), where('storeId', 'in', storeIds.slice(0, 30)))
        );
        ordersSnap.docs.forEach((d) => {
          const order = d.data() as Order;
          if (order.status === 'cancelled') return;
          order.products.forEach((item) => {
            soldByProductId.set(item.productId, (soldByProductId.get(item.productId) ?? 0) + item.quantity);
          });
        });
      }

      setProducts(raw.map((p) => ({
        ...p,
        storeName: storeById.get(p.storeId)?.name ?? 'Tienda',
        region: storeById.get(p.storeId)?.region ?? 'Sin región',
        soldCount: soldByProductId.get(p.id) ?? 0,
      })));
    } catch (e: any) {
      console.error('Error cargando promociones:', e);
      setError(e?.message ?? 'Error al cargar promociones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function setStatus(product: PromoProduct, status: 'approved' | 'rejected') {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { promotionStatus: status });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, promotionStatus: status } : p));
  }

  const regions = ['all', ...Array.from(new Set(products.map((p) => p.region))).sort()];
  const byRegion = region === 'all' ? products : products.filter((p) => p.region === region);
  const filtered = statusFilter === 'all' ? byRegion : byRegion.filter((p) => p.promotionStatus === statusFilter);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={PURPLE} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F3FF' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: PURPLE, marginBottom: 4 }}>🎉 Promociones ({filtered.length})</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 10 }}>Aprueba o retira productos del banner "Cerca de ti"</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {regions.map((r) => (
              <TouchableOpacity key={r} onPress={() => setRegion(r)} style={{ backgroundColor: region === r ? PURPLE : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: region === r ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: region === r ? '#fff' : '#374151', fontWeight: '600', fontSize: 13 }}>{r === 'all' ? '📍 Todas las regiones' : r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
              <TouchableOpacity key={f} onPress={() => setStatusFilter(f)} style={{ backgroundColor: statusFilter === f ? '#EDE9FE' : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: statusFilter === f ? PURPLE : '#E5E7EB' }}>
                <Text style={{ color: statusFilter === f ? PURPLE : '#374151', fontWeight: '600', fontSize: 13 }}>{f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobadas' : f === 'rejected' ? 'Rechazadas' : 'Todas'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}>
        {error ? (
          <Text style={{ color: '#EF4444', paddingVertical: 20 }}>Error al cargar: {error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={{ color: '#9CA3AF', textAlign: 'center', paddingVertical: 40 }}>No hay promociones en esta categoría</Text>
        ) : (
          filtered.map((p) => {
            const discountPct = p.originalPrice ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
            return (
              <View key={p.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {p.photos?.[0] ? (
                    <Image source={{ uri: p.photos[0] }} style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#F5F3FF' }} />
                  ) : (
                    <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 22 }}>📦</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{p.name}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{p.storeName} · 📍 {p.region}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text style={{ fontWeight: '800', color: PURPLE, fontSize: 14 }}>${p.price.toLocaleString('es-CL')}</Text>
                      {p.originalPrice ? <Text style={{ color: '#9CA3AF', fontSize: 12, textDecorationLine: 'line-through' }}>${p.originalPrice.toLocaleString('es-CL')}</Text> : null}
                      {discountPct > 0 && <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700', backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>-{discountPct}%</Text>}
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>📈 {p.soldCount} vendidos en JunglApp</Text>
                  <View style={{
                    backgroundColor: p.promotionStatus === 'approved' ? '#ECFDF5' : p.promotionStatus === 'pending' ? '#FFFBEB' : '#FEF2F2',
                    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                  }}>
                    <Text style={{
                      fontSize: 11, fontWeight: '600',
                      color: p.promotionStatus === 'approved' ? '#059669' : p.promotionStatus === 'pending' ? '#D97706' : '#EF4444',
                    }}>
                      {p.promotionStatus === 'approved' ? 'Aprobada' : p.promotionStatus === 'pending' ? 'Pendiente' : 'Rechazada'}
                    </Text>
                  </View>
                </View>

                {p.promotionStatus === 'pending' && (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity onPress={() => setStatus(p, 'approved')} style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#059669', fontWeight: '700' }}>✅ Aprobar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setStatus(p, 'rejected')} style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#EF4444', fontWeight: '700' }}>❌ Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {p.promotionStatus === 'approved' && (
                  <TouchableOpacity
                    onPress={() => Alert.alert('Confirmar', `¿Quitar "${p.name}" de "Cerca de ti"?`, [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Quitar', style: 'destructive', onPress: () => setStatus(p, 'rejected') },
                    ])}
                    style={{ marginTop: 10, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>🚫 Quitar de "Cerca de ti"</Text>
                  </TouchableOpacity>
                )}
                {p.promotionStatus === 'rejected' && (
                  <TouchableOpacity onPress={() => setStatus(p, 'approved')} style={{ marginTop: 10, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
                    <Text style={{ color: '#059669', fontSize: 13, fontWeight: '700' }}>✅ Aprobar de todos modos</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
