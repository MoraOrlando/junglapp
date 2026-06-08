import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import type { Store } from '@junglapp/types';

const { db } = initFirebase();
const AMBER = '#D97706';

export default function StoreProfileScreen() {
  const { user, logOut } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [storeDocId, setStoreDocId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

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
        if (s.location) setLocation(s.location);
      }
    });
  }, [user]);

  async function captureLocation() {
    setGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Activa la ubicación en ajustes.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación.');
    } finally {
      setGettingLocation(false);
    }
  }

  async function save() {
    if (!storeDocId) return;
    setSaving(true);
    try {
      const updates: any = { name, description, phone, address };
      if (location) updates.location = location;
      await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), updates);
      Alert.alert('✅', 'Tienda actualizada correctamente');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!store) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={AMBER} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: AMBER, marginTop: 20, marginBottom: 20 }}>
          Mi Tienda 🏪
        </Text>

        {/* Store card */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 40, width: 80, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 36 }}>🏪</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>{store.name}</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 2 }}>{store.email}</Text>
          <View style={{
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8,
            backgroundColor: store.status === 'approved' ? '#ECFDF5' : store.status === 'pending' ? '#FFFBEB' : '#FEF2F2',
          }}>
            <Text style={{
              fontSize: 12, fontWeight: '600',
              color: store.status === 'approved' ? '#059669' : store.status === 'pending' ? '#D97706' : '#EF4444',
            }}>
              {store.status === 'approved' ? '✅ Verificada' : store.status === 'pending' ? '⏳ En revisión' : '❌ Rechazada'}
            </Text>
          </View>
          {store.rut && (
            <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 6 }}>RUT: {store.rut}</Text>
          )}
        </View>

        {/* Editable fields */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 14 }}>Información de la tienda</Text>
          {[
            { label: 'Nombre', value: name, set: setName },
            { label: 'Descripción', value: description, set: setDescription, multiline: true },
            { label: 'Teléfono', value: phone, set: setPhone, keyboard: 'phone-pad' },
            { label: 'Dirección', value: address, set: setAddress },
          ].map((f) => (
            <View key={f.label} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>{f.label}</Text>
              <TextInput
                style={{
                  borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14,
                  ...(f.multiline ? { minHeight: 72, textAlignVertical: 'top' } : {}),
                }}
                value={f.value}
                onChangeText={f.set}
                multiline={f.multiline}
                numberOfLines={f.multiline ? 3 : 1}
                keyboardType={f.keyboard as any}
              />
            </View>
          ))}
        </View>

        {/* Geolocalización */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 6 }}>📍 Ubicación</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 12 }}>
            Permite que los clientes cercanos te encuentren.
          </Text>
          {location && (
            <View style={{ backgroundColor: '#ECFDF5', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <Text style={{ color: '#059669', fontSize: 12, fontWeight: '600' }}>
                ✅ Ubicación guardada ({location.lat.toFixed(5)}, {location.lng.toFixed(5)})
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={captureLocation}
            disabled={gettingLocation}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              borderWidth: 1, borderColor: location ? '#10B981' : AMBER,
              borderRadius: 12, paddingVertical: 11,
              backgroundColor: location ? '#ECFDF5' : '#FEF3C7',
            }}
          >
            {gettingLocation ? <ActivityIndicator size="small" color={AMBER} /> : <Text style={{ fontSize: 16 }}>📍</Text>}
            <Text style={{ color: location ? '#059669' : AMBER, fontWeight: '600', fontSize: 14 }}>
              {gettingLocation ? 'Obteniendo ubicación...' : location ? 'Actualizar ubicación' : 'Capturar ubicación'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: AMBER, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, opacity: saving ? 0.7 : 1 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logOut}
          style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 40, backgroundColor: '#FEF2F2' }}
        >
          <Text style={{ color: '#EF4444', fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
