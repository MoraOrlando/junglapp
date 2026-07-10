import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { validateRut, formatRut } from '../../lib/rut';

const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

export default function CompleteProfileScreen() {
  const { user, updateProfile } = useAuth();
  const router = useRouter();
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [city, setCity] = useState(user?.city || '');
  const [region, setRegion] = useState(user?.region || 'Metropolitana');
  const [regionOpen, setRegionOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  function openRegionPicker() {
    Keyboard.dismiss();
    setTimeout(() => setRegionOpen((v) => !v), 150);
  }

  async function captureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {} finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!rut.trim()) { Alert.alert('Requerido', 'Ingresa tu RUT'); return; }
    if (!validateRut(rut)) { Alert.alert('RUT inválido', 'Ingresa un RUT chileno válido (ej: 12.345.678-9)'); return; }
    if (!phone.trim()) { Alert.alert('Requerido', 'Ingresa tu teléfono'); return; }
    if (!address.trim()) { Alert.alert('Requerido', 'Ingresa tu dirección'); return; }
    if (!city.trim()) { Alert.alert('Requerido', 'Ingresa tu ciudad/comuna'); return; }

    setSaving(true);
    try {
      await updateProfile({
        rut: rut.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        region,
        ...(coords ? { location: coords } : {}),
        profileComplete: true,
      });
      router.replace('/(owner)');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: 24, marginBottom: 28 }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: '#15803d' }}>¡Casi listo! 🐾</Text>
            <Text style={{ color: '#6B7280', marginTop: 8, fontSize: 15 }}>
              Completa tu perfil para comenzar a usar JunglApp
            </Text>
          </View>

          {/* RUT */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>RUT / Cédula de identidad</Text>
            <TextInput
              style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937' }}
              placeholder="12.345.678-9"
              placeholderTextColor="#9CA3AF"
              value={rut}
              onChangeText={(t) => setRut(formatRut(t))}
              autoCapitalize="characters"
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          {/* Phone */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Teléfono</Text>
            <TextInput
              style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937' }}
              placeholder="+56 9 1234 5678"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          {/* Address */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Dirección</Text>
            <TextInput
              style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937' }}
              placeholder="Av. Principal 123"
              placeholderTextColor="#9CA3AF"
              value={address}
              onChangeText={setAddress}
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          {/* Region */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Región</Text>
            <TouchableOpacity
              style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              onPress={openRegionPicker}
            >
              <Text style={{ fontSize: 16, color: '#1F2937' }}>{region}</Text>
              <Text style={{ color: '#9CA3AF' }}>{regionOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {regionOpen && (
              <View style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginTop: 8, backgroundColor: '#fff' }}>
                {REGIONS.map((r, i) => (
                  <TouchableOpacity
                    key={r}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 12,
                      borderBottomWidth: i === REGIONS.length - 1 ? 0 : 1, borderBottomColor: '#F3F4F6',
                      backgroundColor: region === r ? '#f0fdf4' : '#fff',
                    }}
                    onPress={() => { setRegion(r); setRegionOpen(false); }}
                  >
                    <Text style={{ fontSize: 16, color: region === r ? '#15803d' : '#374151', fontWeight: region === r ? '600' : '400' }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* City */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}>Ciudad / Comuna</Text>
            <TextInput
              style={{ height: 50, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: '#fff', color: '#1F2937' }}
              placeholder="Providencia"
              placeholderTextColor="#9CA3AF"
              value={city}
              onChangeText={setCity}
              textContentType="none"
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          {/* Location */}
          <TouchableOpacity
            style={{ height: 50, borderWidth: 1, borderColor: coords ? '#86efac' : '#E5E7EB', borderRadius: 12, backgroundColor: coords ? '#f0fdf4' : '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
            onPress={captureLocation}
            disabled={locating}
          >
            <Text style={{ color: coords ? '#15803d' : '#6B7280', fontWeight: '500' }}>
              {locating ? 'Obteniendo ubicación...' : coords ? '✓ Ubicación capturada 📍' : '📍 Usar mi ubicación actual'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ backgroundColor: saving ? '#86efac' : '#16a34a', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Completar perfil</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
