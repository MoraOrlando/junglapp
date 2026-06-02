import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const roles = [
  {
    id: 'owner',
    emoji: '👨‍👩‍👧',
    title: 'Dueño de Mascota',
    subtitle: 'Family Lover',
    description: 'Registra tus mascotas, agenda veterinarios y encuentra pareja para tu mascota.',
    color: 'bg-green-50 border-green-200',
    textColor: 'text-primary-600',
  },
  {
    id: 'vet',
    emoji: '🩺',
    title: 'Médico Veterinario',
    subtitle: 'Profesional',
    description: 'Gestiona tus citas, fichas médicas y ofrece tus servicios.',
    color: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-600',
  },
  {
    id: 'store',
    emoji: '🏪',
    title: 'Tienda Pet Shop',
    subtitle: 'Comercio',
    description: 'Publica y vende productos para mascotas desde tu tienda.',
    color: 'bg-amber-50 border-amber-200',
    textColor: 'text-amber-600',
  },
  {
    id: 'walker',
    emoji: '🦮',
    title: 'Paseador de Perros',
    subtitle: 'Dog Walker',
    description: 'Ofrece paseos y cuidado de perros en tu zona.',
    color: 'bg-orange-50 border-orange-200',
    textColor: 'text-orange-600',
  },
  {
    id: 'grooming',
    emoji: '✂️',
    title: 'Peluquería',
    subtitle: 'Grooming · A domicilio o tienda',
    description: 'Ofrece baño, corte y estética para mascotas desde tu local o a domicilio.',
    color: 'bg-purple-50 border-purple-200',
    textColor: 'text-purple-600',
  },
];

export default function RegisterScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6">
        <TouchableOpacity onPress={() => router.back()} className="mt-4 mb-8">
          <Text className="text-primary-500 text-base">← Volver</Text>
        </TouchableOpacity>

        <View className="mb-8">
          <Text className="text-3xl font-bold text-primary-700">Crear Cuenta 🐾</Text>
          <Text className="text-gray-500 mt-2">Selecciona el tipo de cuenta que quieres crear</Text>
        </View>

        <View className="gap-4">
          {roles.map((role) => (
            <TouchableOpacity
              key={role.id}
              className={`${role.color} border rounded-2xl p-5`}
              onPress={() => router.push(`/(auth)/register-${role.id}` as any)}
            >
              <View className="flex-row items-center gap-4">
                <Text className="text-4xl">{role.emoji}</Text>
                <View className="flex-1">
                  <Text className={`font-bold text-lg ${role.textColor}`}>{role.title}</Text>
                  <Text className="text-gray-500 text-xs">{role.subtitle}</Text>
                  <Text className="text-gray-600 text-sm mt-1">{role.description}</Text>
                </View>
                <Text className="text-gray-400 text-xl">›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row justify-center mt-8 mb-10">
          <Text className="text-gray-500">¿Ya tienes cuenta? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text className="text-primary-500 font-semibold">Inicia sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
