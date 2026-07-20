import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { initFirebase, COLLECTIONS } from '@junglapp/firebase';

const { db } = initFirebase();

type BusinessType = 'vet' | 'store' | 'groomer' | 'walker' | 'trainer';

const TYPE_META: Record<BusinessType, { collection: string; emoji: string; color: string; kindLabel: string }> = {
  vet: { collection: COLLECTIONS.VETERINARIANS, emoji: '🩺', color: '#1D4ED8', kindLabel: 'Veterinario' },
  store: { collection: COLLECTIONS.STORES, emoji: '🛒', color: '#D97706', kindLabel: 'Tienda' },
  groomer: { collection: COLLECTIONS.GROOMERS, emoji: '✂️', color: '#9333EA', kindLabel: 'Peluquería' },
  walker: { collection: COLLECTIONS.WALKERS, emoji: '🦮', color: '#16A34A', kindLabel: 'Paseador' },
  trainer: { collection: COLLECTIONS.TRAINERS, emoji: '🎓', color: '#EA580C', kindLabel: 'Entrenador' },
};

export default function GuestBusinessProfileScreen() {
  const router = useRouter();
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const businessType = (type as BusinessType) in TYPE_META ? (type as BusinessType) : 'vet';
  const meta = TYPE_META[businessType];

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, meta.collection, id)).then((snap) => {
      setData(snap.exists() ? snap.data() : null);
    }).finally(() => setLoading(false));
  }, [id, businessType]);

  function goRegister() {
    router.push('/(auth)/register' as any);
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={meta.color} />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>{meta.emoji}</Text>
        <Text style={{ color: '#64748B', textAlign: 'center' }}>No se encontró este perfil.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: meta.color, fontWeight: '700' }}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isClinic = businessType === 'vet' && (data.isClinic ?? false);
  const displayName = businessType === 'vet' && !isClinic ? `Dr. ${data.name}` : (data.businessName || data.name);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Text style={{ fontSize: 22, color: meta.color }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 16, fontWeight: '700', color: meta.color }}>{meta.kindLabel}</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 20 }}>
          {data.photoUrl ? (
            <Image source={{ uri: data.photoUrl }} style={{ width: 96, height: 96, borderRadius: 24 }} contentFit="cover" />
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 24, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 44 }}>{meta.emoji}</Text>
            </View>
          )}
          <Text style={{ fontWeight: '800', fontSize: 20, color: '#1E293B', marginTop: 12, textAlign: 'center' }}>{displayName}</Text>
          {data.rating != null && (
            <Text style={{ color: '#F59E0B', fontWeight: '600', marginTop: 4 }}>
              ⭐ {Number(data.rating).toFixed(1)} {data.reviewCount ? `(${data.reviewCount} reseñas)` : ''}
            </Text>
          )}
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6', gap: 10 }}>
          {(data.address || data.city) && (
            <Text style={{ color: '#475569', fontSize: 14 }}>📍 {data.address || `${data.city}, ${data.region ?? ''}`}</Text>
          )}
          {businessType === 'vet' && data.is24_7 && (
            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>🚨 Urgencias 24/7</Text>
          )}
          {businessType === 'vet' && !data.is24_7 && data.openingHours && (
            <Text style={{ color: '#64748B', fontSize: 13 }}>🕐 {data.openingHours}</Text>
          )}
          {businessType === 'vet' && data.consultationFee > 0 && (
            <Text style={{ color: '#16A34A', fontWeight: '600', fontSize: 13 }}>💰 ${Number(data.consultationFee).toLocaleString('es-CL')} consulta</Text>
          )}
          {businessType === 'walker' && data.walkFee > 0 && (
            <Text style={{ color: '#16A34A', fontWeight: '600', fontSize: 13 }}>💰 ${Number(data.walkFee).toLocaleString('es-CL')} por paseo</Text>
          )}
          {businessType === 'store' && data.description && (
            <Text style={{ color: '#475569', fontSize: 13 }}>{data.description}</Text>
          )}
          {(businessType === 'groomer' || businessType === 'walker') && data.serviceType && (
            <Text style={{ color: '#475569', fontSize: 13 }}>
              {data.serviceType === 'home' ? '🏠 A domicilio' : '🏪 En tienda'}
            </Text>
          )}
        </View>

        <View style={{ backgroundColor: '#EFF6FF', borderRadius: 20, padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>🔒</Text>
          <Text style={{ fontWeight: '700', color: '#1E293B', fontSize: 15, textAlign: 'center', marginBottom: 4 }}>
            Crea una cuenta para continuar
          </Text>
          <Text style={{ color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
            Para reservar, escribir un mensaje o dejar una reseña necesitas una cuenta gratuita.
          </Text>
          <TouchableOpacity onPress={goRegister} style={{ backgroundColor: '#1D4ED8', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Crear cuenta gratis</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
