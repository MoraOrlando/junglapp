import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import type { Product, Store } from '@junglapp/types';

const { db } = initFirebase();

interface ProductWithStore extends Product {
  storeName?: string;
}

export default function StoreScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductWithStore[]>([]);
  const [filtered, setFiltered] = useState<ProductWithStore[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = ['Alimentos', 'Juguetes', 'Accesorios', 'Higiene', 'Salud'];

  async function loadProducts() {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.PRODUCTS), where('isActive', '==', true))
    );
    const prods = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductWithStore));
    setProducts(prods);
    setFiltered(prods);
  }

  useEffect(() => { loadProducts(); }, []);

  useEffect(() => {
    let result = products;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(lower));
    }
    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    setFiltered(result);
  }, [search, selectedCategory, products]);

  async function onRefresh() {
    setRefreshing(true);
    await loadProducts();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-4 pb-2">
        <Text className="text-2xl font-bold text-primary-700 mb-3">Tienda 🛒</Text>

        <View className="bg-white rounded-xl flex-row items-center px-3 border border-gray-200 mb-3">
          <Text className="text-gray-400 mr-2">🔍</Text>
          <TextInput
            className="flex-1 py-3 text-base"
            placeholder="Buscar productos..."
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
          <TouchableOpacity
            className={`mr-2 rounded-full px-4 py-1.5 ${!selectedCategory ? 'bg-primary-500' : 'bg-white border border-gray-200'}`}
            onPress={() => setSelectedCategory(null)}
          >
            <Text className={!selectedCategory ? 'text-white text-sm' : 'text-gray-600 text-sm'}>Todos</Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              className={`mr-2 rounded-full px-4 py-1.5 ${selectedCategory === cat ? 'bg-primary-500' : 'bg-white border border-gray-200'}`}
              onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            >
              <Text className={selectedCategory === cat ? 'text-white text-sm' : 'text-gray-600 text-sm'}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 px-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2D6A4F" />}
      >
        {filtered.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">🛒</Text>
            <Text className="text-gray-500">No se encontraron productos</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-3 pb-6 pt-2">
            {filtered.map((product) => (
              <TouchableOpacity
                key={product.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                style={{ width: (370) / 2 - 6 }}
                onPress={() => router.push(`/(owner)/store/${product.id}` as any)}
              >
                <View className="bg-amber-50 h-32 items-center justify-center">
                  <Text className="text-5xl">🐾</Text>
                </View>
                <View className="p-3">
                  <Text className="font-semibold text-gray-800" numberOfLines={2}>{product.name}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">{product.category}</Text>
                  <View className="flex-row justify-between items-center mt-2">
                    <Text className="text-primary-600 font-bold">${product.price.toLocaleString()}</Text>
                    <View className={`rounded-full px-2 py-0.5 ${product.stock > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      <Text className={`text-xs ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
