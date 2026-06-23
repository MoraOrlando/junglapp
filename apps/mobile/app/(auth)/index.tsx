import { View, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-primary-500">
      <View className="flex-1 items-center justify-between px-6 py-10">
        {/* Header branding */}
        <View className="items-center mt-10">
          <Image
            source={require('../../assets/icon.png')}
            className="w-28 h-28 rounded-2xl mb-4"
            resizeMode="contain"
          />
          <Text className="text-white text-4xl font-bold tracking-wide">JunglApp</Text>
          <Text className="text-accent text-base mt-2 text-center">
            Conecta con el mundo de tus mascotas
          </Text>
        </View>

        {/* Illustration area */}
        <View className="items-center">
          <Text className="text-8xl">🐕🐈</Text>
          <Text className="text-white/70 text-sm text-center mt-4 max-w-xs">
            Veterinarios, tiendas, match de mascotas y mucho más. Todo en un solo lugar.
          </Text>
        </View>

        {/* Action buttons */}
        <View className="w-full gap-4">
          <TouchableOpacity
            className="bg-white rounded-2xl py-4 items-center shadow-md"
            onPress={() => router.push('/(auth)/login')}
          >
            <Text className="text-primary-500 text-base font-semibold">Iniciar Sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-white/20 border border-white/40 rounded-2xl py-4 items-center"
            onPress={() => router.push('/(auth)/register')}
          >
            <Text className="text-white text-base font-semibold">Crear Cuenta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
