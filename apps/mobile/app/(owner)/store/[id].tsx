import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, getDocs, collection, query, where, addDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { Store, Product, StoreService } from '@junglapp/types';

const { db } = initFirebase();
const AMBER = '#D97706';
const GREEN = '#2D6A4F';

export default function StoreDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'products' | 'services'>('products');

  // Order modal
  const [orderProduct, setOrderProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [ordering, setOrdering] = useState(false);

  // Service booking modal
  const [bookService, setBookService] = useState<StoreService | null>(null);
  const [bookNote, setBookNote] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, COLLECTIONS.STORES, id)).then((snap) => {
      if (snap.exists()) setStore({ id: snap.id, ...snap.data() } as Store);
    });
    getDocs(query(collection(db, COLLECTIONS.PRODUCTS), where('storeId', '==', id), where('isActive', '==', true))).then((snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product)));
    });
  }, [id]);

  async function placeOrder() {
    if (!orderProduct || !user) return;
    if (quantity > orderProduct.stock) {
      Alert.alert('Sin stock', `Solo hay ${orderProduct.stock} unidades disponibles`);
      return;
    }
    setOrdering(true);
    try {
      await addDoc(collection(db, COLLECTIONS.ORDERS), {
        buyerId: user.uid,
        storeId: orderProduct.storeId,
        products: [{
          productId: orderProduct.id,
          productName: orderProduct.name,
          quantity,
          price: orderProduct.price,
          photoUrl: orderProduct.photos?.[0] || null,
        }],
        total: orderProduct.price * quantity,
        status: 'pending',
        shippingAddress: user.address,
        createdAt: new Date().toISOString(),
      });
      setOrderProduct(null);
      Alert.alert('¡Pedido realizado! 🎉', `Tu pedido de ${orderProduct.name} fue enviado a la tienda.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setOrdering(false);
    }
  }

  async function placeServiceBooking() {
    if (!bookService || !user || !store) return;
    setBooking(true);
    try {
      await addDoc(collection(db, COLLECTIONS.ORDERS), {
        buyerId: user.uid,
        storeId: store.id,
        type: 'service',
        service: {
          serviceId: bookService.id,
          serviceName: bookService.name,
          price: bookService.price,
          duration: bookService.duration,
          note: bookNote.trim(),
        },
        total: bookService.price,
        status: 'pending',
        shippingAddress: user.address,
        createdAt: new Date().toISOString(),
      });
      setBookService(null);
      setBookNote('');
      Alert.alert('¡Reserva enviada! 🎉', `Tu solicitud de "${bookService.name}" fue enviada a la tienda.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBooking(false);
    }
  }

  const activeServices = (store?.services || []).filter((s) => s.isActive);

  if (!store) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9CA3AF' }}>Cargando tienda...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        {store.logoUrl ? (
          <Image source={{ uri: store.logoUrl }} style={{ width: '100%', height: 180 }} contentFit="cover" />
        ) : (
          <View style={{ width: '100%', height: 160, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 56 }}>🏪</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 8 }}
        >
          <Text style={{ color: '#374151', fontSize: 16, paddingHorizontal: 4 }}>←</Text>
        </TouchableOpacity>

        <View style={{ paddingHorizontal: 24 }}>
          {/* Store info card */}
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: -24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#1F2937' }}>{store.name}</Text>
                <Text style={{ color: '#6B7280', fontSize: 14, marginTop: 4, lineHeight: 20 }}>{store.description}</Text>
              </View>
            </View>

            <View style={{ marginTop: 14, gap: 8 }}>
              {store.address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text>📍</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>{store.address}</Text>
                </View>
              ) : null}
              {store.phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text>📞</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>{store.phone}</Text>
                </View>
              ) : null}
              {store.email ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text>✉️</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13 }}>{store.email}</Text>
                </View>
              ) : null}
            </View>

            {/* Category tags */}
            {store.categories?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {store.categories.map((cat) => (
                  <View key={cat} style={{ backgroundColor: '#FEF3C7', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: AMBER, fontSize: 12, fontWeight: '600' }}>{cat}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 14, padding: 4, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => setActiveTab('products')}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                backgroundColor: activeTab === 'products' ? '#fff' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '700', color: activeTab === 'products' ? AMBER : '#6B7280' }}>
                📦 Productos ({products.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab('services')}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                backgroundColor: activeTab === 'services' ? '#fff' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '700', color: activeTab === 'services' ? '#7C3AED' : '#6B7280' }}>
                ✂️ Servicios ({activeServices.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Products tab */}
          {activeTab === 'products' && (
            <View>
              {products.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 40, marginBottom: 8 }}>📦</Text>
                  <Text style={{ color: '#9CA3AF' }}>Sin productos disponibles</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 32 }}>
                  {products.map((product) => (
                    <TouchableOpacity
                      key={product.id}
                      onPress={() => { setOrderProduct(product); setQuantity(1); }}
                      style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}
                      activeOpacity={0.85}
                    >
                      {product.photos?.[0] ? (
                        <Image source={{ uri: product.photos[0] }} style={{ width: '100%', height: 120 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: '100%', height: 100, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 36 }}>📦</Text>
                        </View>
                      )}
                      <View style={{ padding: 12 }}>
                        <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 14 }} numberOfLines={2}>{product.name}</Text>
                        <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>{product.category}</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <Text style={{ color: GREEN, fontWeight: '800', fontSize: 15 }}>${product.price.toLocaleString()}</Text>
                          <View style={{ backgroundColor: product.stock > 0 ? '#ECFDF5' : '#FEF2F2', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: product.stock > 0 ? '#059669' : '#EF4444', fontWeight: '600' }}>
                              {product.stock > 0 ? `${product.stock} uds` : 'Agotado'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Services tab */}
          {activeTab === 'services' && (
            <View>
              {activeServices.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <Text style={{ fontSize: 40, marginBottom: 8 }}>✂️</Text>
                  <Text style={{ color: '#9CA3AF' }}>Sin servicios disponibles</Text>
                </View>
              ) : (
                <View style={{ gap: 12, paddingBottom: 32 }}>
                  {activeServices.map((svc) => (
                    <View key={svc.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ backgroundColor: '#EDE9FE', borderRadius: 12, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 24 }}>✂️</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '700', fontSize: 15, color: '#1F2937' }}>{svc.name}</Text>
                          {svc.description ? (
                            <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }} numberOfLines={2}>{svc.description}</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                            <Text style={{ color: GREEN, fontWeight: '800', fontSize: 15 }}>${svc.price.toLocaleString()}</Text>
                            {svc.duration ? (
                              <View style={{ backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: '#3B82F6', fontSize: 11 }}>⏱ {svc.duration}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => { setBookService(svc); setBookNote(''); }}
                        style={{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Reservar servicio</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Order modal */}
      <Modal visible={!!orderProduct} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              {orderProduct && (
                <>
                  <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
                    {orderProduct.photos?.[0] ? (
                      <Image source={{ uri: orderProduct.photos[0] }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 72, height: 72, backgroundColor: '#FEF3C7', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 32 }}>📦</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 17, fontWeight: '700', color: '#1F2937' }}>{orderProduct.name}</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 13 }}>{orderProduct.category}</Text>
                      <Text style={{ color: GREEN, fontWeight: '800', fontSize: 16, marginTop: 4 }}>${orderProduct.price.toLocaleString()}</Text>
                    </View>
                  </View>

                  {orderProduct.stock > 0 ? (
                    <>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 }}>Cantidad</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                        <TouchableOpacity
                          onPress={() => setQuantity(Math.max(1, quantity - 1))}
                          style={{ backgroundColor: '#F3F4F6', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 20, color: '#374151', fontWeight: '700' }}>−</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1F2937', minWidth: 32, textAlign: 'center' }}>{quantity}</Text>
                        <TouchableOpacity
                          onPress={() => setQuantity(Math.min(orderProduct.stock, quantity + 1))}
                          style={{ backgroundColor: '#F3F4F6', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 20, color: '#374151', fontWeight: '700' }}>+</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#6B7280', fontSize: 14 }}>
                          Total: <Text style={{ fontWeight: '700', color: GREEN }}>${(orderProduct.price * quantity).toLocaleString()}</Text>
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={placeOrder}
                        disabled={ordering}
                        style={{ backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8, opacity: ordering ? 0.7 : 1 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                          {ordering ? 'Procesando...' : '🛒 Confirmar pedido'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginBottom: 8, alignItems: 'center' }}>
                      <Text style={{ color: '#EF4444', fontWeight: '600' }}>Producto sin stock disponible</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => setOrderProduct(null)}
                    style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Service booking modal */}
      <Modal visible={!!bookService} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
              {bookService && (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 4 }}>✂️ {bookService.name}</Text>
                  <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>{bookService.description}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                    <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ color: GREEN, fontWeight: '700', fontSize: 15 }}>${bookService.price.toLocaleString()}</Text>
                    </View>
                    {bookService.duration && (
                      <View style={{ backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ color: '#3B82F6', fontSize: 13 }}>⏱ {bookService.duration}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Nota (opcional)</Text>
                  <TextInput
                    style={{
                      borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                      paddingHorizontal: 14, paddingVertical: 10, fontSize: 14,
                      minHeight: 72, textAlignVertical: 'top', marginBottom: 20,
                    }}
                    placeholder="Indica el nombre de tu mascota, tamaño, observaciones..."
                    multiline
                    value={bookNote}
                    onChangeText={setBookNote}
                  />

                  <TouchableOpacity
                    onPress={placeServiceBooking}
                    disabled={booking}
                    style={{ backgroundColor: '#7C3AED', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8, opacity: booking ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                      {booking ? 'Enviando...' : '✂️ Confirmar reserva'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setBookService(null)}
                    style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
