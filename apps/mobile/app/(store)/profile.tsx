import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, ActionSheetIOS, Switch
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { initFirebase, COLLECTIONS, uploadImage } from '@junglapp/firebase';
import { useAuth } from '../../context/AuthContext';
import { locationKeys } from '../../lib/locationKey';
import type { Store } from '@junglapp/types';

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const { db } = initFirebase();
const AMBER = '#D97706';

export default function StoreProfileScreen() {
  const { user, logOut, deleteAccount } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [storeDocId, setStoreDocId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('Metropolitana');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [offersDelivery, setOffersDelivery] = useState(true);
  const [offersPickup, setOffersPickup] = useState(false);
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
        setCity(s.city || '');
        setRegion(s.region || 'Metropolitana');
        if (s.location) setLocation(s.location);
        if ((s as any).photoUrl) setPhotoUrl((s as any).photoUrl);
        setOffersDelivery(s.offersDelivery ?? true);
        setOffersPickup(s.offersPickup ?? false);
      }
    });
  }, [user]);

  function openRegionPicker() {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...REGIONS, 'Cancelar'], cancelButtonIndex: REGIONS.length },
      (buttonIndex) => { if (buttonIndex < REGIONS.length) setRegion(REGIONS[buttonIndex]); }
    );
  }

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

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: 'images' });
    if (result.canceled || !result.assets[0]) return;
    setSaving(true);
    try {
      const url = await uploadImage(result.assets[0].uri);
      setPhotoUrl(url);
      if (storeDocId) await updateDoc(doc(db, COLLECTIONS.STORES, storeDocId), { photoUrl: url });
      Alert.alert('✅', 'Foto actualizada');
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!storeDocId) return;
    if (!offersDelivery && !offersPickup) {
      Alert.alert('Elige al menos un método', 'Debes ofrecer despacho a domicilio, retiro en tienda, o ambos.');
      return;
    }
    setSaving(true);
    try {
      const updates: any = { name, description, phone, address, city, region, ...locationKeys(city, region), plan: 'free', offersDelivery, offersPickup };
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

        {user?.accountStatus === 'under_review' && (
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', padding: 14, marginBottom: 16 }}>
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 13 }}>⚠️ Cuenta en revisión</Text>
            <Text style={{ color: '#92400E', fontSize: 12, marginTop: 2 }}>
              Un administrador está evaluando un reporte sobre tu cuenta.
            </Text>
          </View>
        )}

        {/* Store card */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
          <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8} style={{ marginBottom: 12 }}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={{ width: 90, height: 90, borderRadius: 16 }} contentFit="cover" />
            ) : (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 16, width: 90, height: 90, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: AMBER }}>
                <Text style={{ fontSize: 36 }}>🏪</Text>
              </View>
            )}
            <View style={{ position: 'absolute', bottom: -4, right: -4, backgroundColor: AMBER, borderRadius: 10, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>
            </View>
          </TouchableOpacity>
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
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>Ciudad / Comuna</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', fontSize: 14 }}
                value={city}
                onChangeText={setCity}
                placeholder="Ej: Los Ángeles"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4, fontWeight: '500' }}>Región</Text>
              <TouchableOpacity
                onPress={openRegionPicker}
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#F9FAFB', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, color: '#1F2937' }} numberOfLines={1}>{region}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={{ color: '#9CA3AF', fontSize: 11, marginTop: 6 }}>
            Se usan para mostrarte solo a dueños de mascota cerca de tu ciudad en "Cerca de ti".
          </Text>
        </View>

        {/* Métodos de entrega */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
          <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15, marginBottom: 4 }}>🚚 Métodos de entrega</Text>
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 14 }}>
            El cliente elige entre estos al hacer su pedido.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontWeight: '600', color: '#1F2937', fontSize: 14 }}>📦 Despacho a domicilio</Text>
            </View>
            <Switch
              value={offersDelivery}
              onValueChange={setOffersDelivery}
              trackColor={{ false: '#D1D5DB', true: '#95D5B2' }}
              thumbColor={offersDelivery ? '#2D6A4F' : '#F3F4F6'}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontWeight: '600', color: '#1F2937', fontSize: 14 }}>🏪 Retiro en tienda</Text>
            </View>
            <Switch
              value={offersPickup}
              onValueChange={setOffersPickup}
              trackColor={{ false: '#D1D5DB', true: '#95D5B2' }}
              thumbColor={offersPickup ? '#2D6A4F' : '#F3F4F6'}
            />
          </View>
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
          style={{ borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 12, backgroundColor: '#FEE2E2' }}
        >
          <Text style={{ color: '#DC2626', fontWeight: '700' }}>Cerrar sesión</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Alert.alert(
            'Eliminar cuenta',
            'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente. ¿Estás seguro?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await deleteAccount(); } catch (e: any) { Alert.alert('Error', e.message); } } },
            ]
          )}
          style={{ borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 40, backgroundColor: '#F3F4F6' }}
        >
          <Text style={{ color: '#6B7280', fontWeight: '700' }}>Eliminar cuenta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
