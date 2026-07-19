import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';

const HAS_LAUNCHED_KEY = 'junglapp_has_launched_before';

export default function AuthEntryScreen() {
  const router = useRouter();
  const { continueAsGuest } = useAuth();
  const [checking, setChecking] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleGuestBrowse() {
    setGuestLoading(true);
    try {
      await continueAsGuest();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo continuar como invitado.');
    } finally {
      setGuestLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(HAS_LAUNCHED_KEY);
        if (!seen) {
          setShowWelcome(true);
          await AsyncStorage.setItem(HAS_LAUNCHED_KEY, 'true');
        }
      } catch {
        // If storage isn't available for some reason, just skip the welcome screen.
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return <View style={{ flex: 1, backgroundColor: '#2D6A4F' }} />;
  }

  if (!showWelcome) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#2D6A4F' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 40 }}>
        {/* Header branding */}
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Image
            source={require('../../assets/icon.png')}
            style={{ width: 96, height: 96, borderRadius: 24, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text style={{ color: 'white', fontSize: 34, fontWeight: '800', letterSpacing: 0.5 }}>JunglApp</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 8, textAlign: 'center' }}>
            Conecta con el mundo de tus mascotas
          </Text>
        </View>

        {/* Illustration */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 72 }}>🐕🐈</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', marginTop: 16, maxWidth: 280 }}>
            Veterinarios, tiendas, match de mascotas y mucho más. Todo en un solo lugar.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ width: '100%', gap: 16 }}>
          <TouchableOpacity
            style={{ backgroundColor: 'white', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={{ color: '#2D6A4F', fontSize: 16, fontWeight: '700' }}>Iniciar Sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>Crear Cuenta</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleGuestBrowse}
            disabled={guestLoading}
            style={{
              borderRadius: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed',
              opacity: guestLoading ? 0.7 : 1,
            }}
          >
            {guestLoading ? (
              <ActivityIndicator color="rgba(255,255,255,0.85)" />
            ) : (
              <>
                <Text style={{ fontSize: 16 }}>🔍</Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '700' }}>
                  Explorar veterinarios y tiendas sin cuenta
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
