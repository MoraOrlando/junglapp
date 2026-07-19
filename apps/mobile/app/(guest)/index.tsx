import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

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

export default function GuestHomeScreen() {
  const router = useRouter();
  const { logOut } = useAuth();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: '#1D4ED8' }}>Explorar JunglApp</Text>
        <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>
          Estás navegando como invitado. Crea una cuenta para reservar o escribir a un negocio.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, marginTop: 12, marginBottom: 8, flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={async () => { await logOut(); router.replace('/(auth)/register' as any); }}
          style={{ flex: 1, backgroundColor: '#1D4ED8', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Crear cuenta</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => { await logOut(); router.replace('/(auth)/login' as any); }}
          style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#1D4ED8', fontWeight: '700', fontSize: 14 }}>Iniciar sesión</Text>
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
              onPress={() => router.push(`/(guest)/${c.id}` as any)}
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
