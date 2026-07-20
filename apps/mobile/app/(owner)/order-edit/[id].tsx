import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Product } from '@junglapp/types';

const { db } = initFirebase();
const GREEN = '#2D6A4F';
const RED = '#DC2626';

interface OrderItem { productId: string; productName: string; quantity: number; price: number; photoUrl?: string | null; }
interface OrderData { id: string; status: string; storeId: string; products: OrderItem[]; total: number; }

export default function OrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const snap = await getDoc(doc(db, COLLECTIONS.ORDERS, id));
      if (!snap.exists()) { setLoading(false); return; }
      const data = { id: snap.id, ...snap.data() } as OrderData;
      if (data.status !== 'pending') {
        Alert.alert('No se puede editar', 'Este pedido ya no está pendiente — la tienda ya lo vio.');
        router.back();
        return;
      }
      setOrder(data);
      setItems(data.products || []);
      const productsSnap = await getDocs(
        query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', data.storeId), where('isActive', '==', true))
      );
      setStoreProducts(productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
      setLoading(false);
    })();
  }, [id]);

  function changeQty(productId: string, delta: number) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.productId !== productId) return it;
        const product = storeProducts.find((p) => p.id === productId);
        const maxStock = product?.stock ?? it.quantity;
        return { ...it, quantity: Math.max(1, Math.min(maxStock, it.quantity + delta)) };
      })
    );
  }

  function removeItem(productId: string) {
    if (items.length <= 1) {
      Alert.alert('No se puede quitar', 'Un pedido necesita al menos un producto. Para eliminarlo todo, cancela el pedido en su lugar.');
      return;
    }
    setItems((prev) => prev.filter((it) => it.productId !== productId));
  }

  function addProduct(product: Product) {
    if (items.some((it) => it.productId === product.id)) return;
    if (product.stock <= 0) {
      Alert.alert('Sin stock', 'Este producto no tiene stock disponible.');
      return;
    }
    setItems((prev) => [
      ...prev,
      { productId: product.id, productName: product.name, quantity: 1, price: product.price, photoUrl: product.photos?.[0] || null },
    ]);
    setShowAddPicker(false);
  }

  const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const availableToAdd = storeProducts.filter((p) => !items.some((it) => it.productId === p.id) && p.stock > 0);

  async function save() {
    if (!order) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.ORDERS, order.id), {
        products: items,
        total,
        updatedAt: new Date().toISOString(),
      });
      Alert.alert('Pedido actualizado', 'Los cambios se guardaron correctamente.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar el pedido.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GREEN} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6B7280' }}>Pedido no encontrado.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12, gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: '#6B7280' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937' }}>Editar pedido ✏️</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const product = storeProducts.find((p) => p.id === it.productId);
          const maxStock = product?.stock ?? it.quantity;
          return (
            <View
              key={it.productId}
              style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              {it.photoUrl ? (
                <Image source={{ uri: it.photoUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>🛍️</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', color: '#374151', fontSize: 13 }}>{it.productName}</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>${it.price.toLocaleString('es-CL')} c/u</Text>
              </View>
              <TouchableOpacity
                onPress={() => changeQty(it.productId, -1)}
                style={{ backgroundColor: '#F3F4F6', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16, color: '#374151', fontWeight: '700' }}>−</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937', minWidth: 20, textAlign: 'center' }}>{it.quantity}</Text>
              <TouchableOpacity
                onPress={() => changeQty(it.productId, 1)}
                disabled={it.quantity >= maxStock}
                style={{ backgroundColor: '#F3F4F6', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: it.quantity >= maxStock ? 0.4 : 1 }}
              >
                <Text style={{ fontSize: 16, color: '#374151', fontWeight: '700' }}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeItem(it.productId)} style={{ marginLeft: 4 }}>
                <Text style={{ fontSize: 18, color: RED }}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {!showAddPicker ? (
          <TouchableOpacity
            onPress={() => setShowAddPicker(true)}
            style={{ borderWidth: 1, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16 }}
          >
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 13 }}>+ Agregar producto</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: '700', color: '#374151', fontSize: 13, marginBottom: 8 }}>Elige un producto</Text>
            {availableToAdd.length === 0 ? (
              <Text style={{ color: '#9CA3AF', fontSize: 12 }}>No hay más productos disponibles de esta tienda.</Text>
            ) : (
              availableToAdd.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => addProduct(p)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#F3F4F6' }}
                >
                  {p.photos?.[0] ? (
                    <Image source={{ uri: p.photos[0] }} style={{ width: 36, height: 36, borderRadius: 8 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>🛍️</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: '#374151', fontSize: 13 }}>{p.name}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 11 }}>${p.price.toLocaleString('es-CL')} · {p.stock} disponibles</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity onPress={() => setShowAddPicker(false)} style={{ marginTop: 4 }}>
              <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={{ padding: 24, borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ color: '#6B7280', fontSize: 14 }}>Total</Text>
          <Text style={{ fontWeight: '800', color: GREEN, fontSize: 18 }}>${total.toLocaleString('es-CL')}</Text>
        </View>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{saving ? 'Guardando...' : '💾 Guardar cambios'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
