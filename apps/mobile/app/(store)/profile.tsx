import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Store } from '@junglapp/types';

const { db } = initFirebase();

export default function StoreProfileScreen() {
  const { user, logOut } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [storeDocId, setStoreDocId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, COLLECTIONS.STORES), where('userId', '==', user.uid))).then((snap) => {
      if (!snap.empty) {
        const s = { id: snap.docs[0].id, ...snap.docs[0].data() } as Store;
        setStore(s);
        setStoreDocId(snap.docs[0].id);
        setName(s.name);
        setDescription(s.description);
        setPhone(s.phone);
        setAddress(s.address);
      }
    });
  }, [user]);

  async function save() {
    if (!storeDocId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), { name, description, phone, address });
      Alert.alert('✅', 'Tienda actualizada');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!store) return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center">
      <Text className="text-gray-400">Cargando tienda...</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6">
        <Text className="text-2xl font-bold text-amber-700 mt-4 mb-6">Mi Tienda 🏪</Text>

        <View className="bg-white rounded-2xl p-5 mb-4 shadow-sm border border-gray-100 items-center">
          <View className="bg-amber-100 rounded-full w-20 h-20 items-center justify-center mb-3">
            <Text className="text-4xl">🏪</Text>
          </View>
          <Text className="text-xl font-bold text-gray-800">{store.name}</Text>
          <Text className="text-gray-500 text-sm">{store.email}</Text>
          <View className={`rounded-full px-3 py-1 mt-2 ${store.status === 'approved' ? 'bg-green-100' : store.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'}`}>
            <Text className={`text-xs font-medium ${store.status === 'approved' ? 'text-green-600' : store.status === 'pending' ? 'text-yellow-600' : 'text-red-500'}`}>
              {store.status === 'approved' ? '✅ Verificada' : store.status === 'pending' ? '⏳ En revisión' : '❌ Rechazada'}
            </Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm border border-gray-100">
          <Text className="font-semibold text-gray-700 mb-3">Información de la tienda</Text>
          {[
            { label: 'Nombre', value: name, set: setName },
            { label: 'Descripción', value: description, set: setDescription, multiline: true },
            { label: 'Teléfono', value: phone, set: setPhone },
            { label: 'Dirección', value: address, set: setAddress },
          ].map((f) => (
            <View key={f.label} className="mb-3">
              <Text className="text-sm text-gray-600 mb-1">{f.label}</Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-base"
                value={f.value}
                onChangeText={f.set}
                multiline={f.multiline}
                numberOfLines={f.multiline ? 3 : 1}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          className={`bg-amber-500 rounded-2xl py-4 items-center mb-4 ${saving ? 'opacity-70' : ''}`}
          onPress={save}
          disabled={saving}
        >
          <Text className="text-white font-semibold">{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-red-50 border border-red-200 rounded-2xl py-4 items-center mb-10"
          onPress={logOut}
        >
          <Text className="text-red-500 font-semibold">Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
