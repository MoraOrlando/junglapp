import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
import * as Location from 'expo-location';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';
import { useAuth } from '../../../context/AuthContext';
import type { UserAddress } from '@junglapp/types';

const { db } = initFirebase();

type Category = 'vet' | 'veterinaria' | 'urgencias' | 'walker' | 'store' | 'groomer' | 'trainer';

const CATEGORIES: { id: Category; label: string; emoji: string; color: string }[] = [
  { id: 'vet', label: 'Veterinarios', emoji: '🩺', color: '#EFF6FF' },
  { id: 'veterinaria', label: 'Veterinarias', emoji: '🏥', color: '#EFF6FF' },
  { id: 'urgencias', label: 'Urgencias', emoji: '🚨', color: '#FEF2F2' },
  { id: 'walker', label: 'Paseadores', emoji: '🦮', color: '#F0FDF4' },
  { id: 'store', label: 'Tiendas', emoji: '🛒', color: '#FEF3C7' },
  { id: 'groomer', label: 'Peluquerías', emoji: '✂️', color: '#FAF5FF' },
  { id: 'trainer', label: 'Entrenadores', emoji: '🎓', color: '#FFF7ED' },
];

export default function NearScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  async function detectLocation() {
    // Use saved address if available
    const addresses: any[] = (user as any)?.addresses ?? [];
    const selectedId = (user as any)?.selectedAddressId;
    const selectedAddr = addresses.find((a) => a.id === selectedId) ?? addresses[0];
    if (selectedAddr?.city) { setCurrentCity(selectedAddr.city); return; }

    // Fallback to GPS
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setCurrentCity(user?.city ?? null); return; }
      setLocating(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setCurrentCity(geo?.city ?? geo?.subregion ?? user?.city ?? null);
    } catch {
      setCurrentCity(user?.city ?? null);
    } finally {
      setLocating(false);
    }
  }

  const selectedAddressId = (user as any)?.selectedAddressId ?? null;
  useFocusEffect(useCallback(() => { if (user) detectLocation().catch(() => {}); }, [user?.uid, selectedAddressId]));

  const addresses: UserAddress[] = (user as any)?.addresses ?? [];

  async function selectAddress(id: string) {
    if (!user) return;
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { selectedAddressId: id });
      await updateProfile({ selectedAddressId: id } as any);
    } catch {}
    setShowAddressPicker(false);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Address picker modal */}
      <Modal visible={showAddressPicker} animationType="slide" transparent>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowAddressPicker(false)}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>Seleccionar dirección</Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>Los servicios mostrados serán de esa zona</Text>

            {addresses.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={{ color: '#94A3B8', fontSize: 14, marginBottom: 12 }}>No tienes direcciones guardadas</Text>
                <TouchableOpacity
                  onPress={() => { setShowAddressPicker(false); router.push('/(owner)/addresses' as any); }}
                  style={{ backgroundColor: '#16A34A', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Agregar dirección</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {addresses.map((addr) => {
                  const isSelected = addr.id === selectedAddressId;
                  return (
                    <TouchableOpacity
                      key={addr.id}
                      onPress={() => selectAddress(addr.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                        borderRadius: 16, borderWidth: 2,
                        borderColor: isSelected ? '#1D4ED8' : '#E2E8F0',
                        backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{isSelected ? '✅' : '📍'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: '#1E293B' }}>{addr.label}</Text>
                        <Text style={{ color: '#64748B', fontSize: 12 }}>{addr.address}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 11 }}>{addr.city} · {addr.region}</Text>
                      </View>
                      {isSelected && <Text style={{ color: '#1D4ED8', fontSize: 11, fontWeight: '700' }}>ACTIVA</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={() => { setShowAddressPicker(false); router.push('/(owner)/addresses' as any); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 4 }}
                >
                  <Text style={{ color: '#1D4ED8', fontSize: 14, fontWeight: '600' }}>+ Administrar direcciones</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1D4ED8' }}>Cerca de ti</Text>
        <TouchableOpacity
          onPress={() => setShowAddressPicker(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          {locating
            ? <ActivityIndicator size="small" color="#1D4ED8" />
            : <Text style={{ fontSize: 13 }}>📍</Text>
          }
          <Text style={{ color: '#1D4ED8', fontSize: 13, fontWeight: '600' }}>
            {currentCity ?? 'Detectando ubicación...'}
          </Text>
          <Text style={{ color: '#93C5FD', fontSize: 11 }}>▼</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}>
        <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 14 }}>
          Elige una categoría para ver los prestadores más cercanos a ti.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => router.push(`/(owner)/near/${c.id}` as any)}
              style={{
                width: '47%',
                backgroundColor: c.color,
                borderRadius: 20,
                paddingVertical: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: '#F1F5F9',
              }}
            >
              <Text style={{ fontSize: 34, marginBottom: 8 }}>{c.emoji}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E293B' }}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
