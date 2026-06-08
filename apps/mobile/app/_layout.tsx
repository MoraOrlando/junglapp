import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import '../global.css';

function RouteGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const inOwner = segments[0] === '(owner)';
    const inVet = segments[0] === '(vet)';
    const inStore = segments[0] === '(store)';
    const inSupport = segments[0] === '(support)';
    const inTrainer = segments[0] === '(trainer)';

    if (!user && !inAuth) {
      router.replace('/(auth)');
      return;
    }

    if (user) {
      const role = user.role;
      if (inAuth) {
        if (role === 'owner') router.replace('/(owner)');
        else if (role === 'vet') router.replace('/(vet)');
        else if (role === 'store') router.replace('/(store)');
        else if (role === 'trainer') router.replace('/(trainer)');
        else if (role === 'support') router.replace('/(owner)');
      }
    }
  }, [user, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RouteGuard />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(owner)" />
            <Stack.Screen name="(vet)" />
            <Stack.Screen name="(store)" />
            <Stack.Screen name="(trainer)" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
