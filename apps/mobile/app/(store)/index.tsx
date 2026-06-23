import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Product, Store } from '@junglapp/types';

const { db } = initFirebase();
const AMBER = '#D97706';

export default function StoreProductsScreen() {
  const { user, logOut } = useAuth();
  const router = useRouter();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    if (!user) return;
    // Store document ID always equals user.uid — direct lookup is faster and reliable for new accounts
    let storeData: Store | null = null;
    const directDoc = await getDoc(doc(db, COLLECTIONS.STORES, user.uid));
    if (directDoc.exists()) {
      storeData = { id: directDoc.id, ...directDoc.data() } as Store;
    } else {
      const storeSnap = await getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid)));
      if (!storeSnap.empty) storeData = { id: storeSnap.docs[0].id, ...storeSnap.docs[0].data() } as Store;
    }
    if (storeData) {
      setStore(storeData);
      const prodSnap = await getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', storeData.id)));
      setProducts(prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    }
  }

  useFocusEffect(useCallback(() => { loadData(); }, [user]));

  async function onRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function toggleActive(product: Product) {
    await updateDoc(doc(db, COLLECTIONS.PRODUCTS, product.id), { isActive: !product.isActive });
    setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, isActive: !p.isActive } : p));
  }

  function confirmDelete(product: Product) {
    Alert.alert('Eliminar producto', `¿Eliminar "${product.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          await deleteDoc(doc(db, COLLECTIONS.PRODUCTS, product.id));
          setProducts((prev) => prev.filter((p) => p.id !== product.id));
        },
      },
    ]);
  }

  const isPending = store?.status === 'pending';
  const createdAtMs = (store as any)?.createdAt ? new Date((store as any).createdAt).getTime() : 0;
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const isTempActive = createdAtMs > 0 && Date.now() - createdAtMs < NINETY_DAYS_MS;
  const daysRemaining = createdAtMs > 0
    ? Math.max(0, Math.ceil((createdAtMs + NINETY_DAYS_MS - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  if (isPending && !isTempActive) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⏳</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#374151', textAlign: 'center' }}>Tienda en revisión</Text>
        <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          Tu tienda está siendo validada por el equipo de JunglApp. Te avisaremos cuando esté aprobada.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 24, backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }}
          onPress={logOut}
        >
          <Text style={{ color: '#6B7280' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Provisional access banner for pending stores */}
      {isPending && isTempActive && (
        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>⏳</Text>
          <Text style={{ flex: 1, color: '#92400E', fontSize: 12, fontWeight: '600' }}>
            Tienda en revisión — acceso provisional por {daysRemaining} días más
          </Text>
        </View>
      )}

      {/* Header */}
      <View style={{ backgroundColor: AMBER, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Mi Tienda</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{store?.name || 'Tienda'} 🏪</Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}
            onPress={logOut}
          >
            <Text style={{ color: '#fff', fontSize: 13 }}>Salir</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{products.length}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Productos</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{products.filter((p) => p.isActive).length}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Activos</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#1F2937' }}>Catálogo</Text>
        <TouchableOpacity
          style={{ backgroundColor: AMBER, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}
          onPress={() => router.push('/(store)/product/add' as any)}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>+ Agregar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} />}
      >
        {products.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 64 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>📦</Text>
            <Text style={{ color: '#6B7280', fontWeight: '600', fontSize: 15 }}>Sin productos aún</Text>
            <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              Agrega tu primer producto para empezar a vender
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12, paddingBottom: 32 }}>
            {products.map((product) => (
              <View key={product.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {product.photos?.[0] ? (
                    <Image
                      source={{ uri: product.photos[0] }}
                      style={{ width: 64, height: 64, borderRadius: 12 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{ width: 64, height: 64, backgroundColor: '#FEF3C7', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 28 }}>📦</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>{product.name}</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{product.category}</Text>
                    <Text style={{ color: '#2D6A4F', fontWeight: '700', marginTop: 2 }}>${product.price.toLocaleString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Stock: {product.stock}</Text>
                    <TouchableOpacity
                      style={{
                        borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
                        backgroundColor: product.isActive ? '#ECFDF5' : '#F3F4F6',
                      }}
                      onPress={() => toggleActive(product)}
                    >
                      <Text style={{ fontSize: 11, color: product.isActive ? '#059669' : '#6B7280', fontWeight: '600' }}>
                        {product.isActive ? 'Activo' : 'Inactivo'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F9FAFB' }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => router.push(`/(store)/product/${product.id}` as any)}
                  >
                    <Text style={{ color: '#3B82F6', fontSize: 13, fontWeight: '600' }}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}
                    onPress={() => confirmDelete(product)}
                  >
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '600' }}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
