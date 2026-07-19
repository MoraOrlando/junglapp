import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../context/AuthContext';
import '../global.css';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function RouteGuard() {
  const { user, isGuest, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === '(auth)';
    const inGuest = (segments[0] as string) === '(guest)';
    const inOwner = segments[0] === '(owner)';
    const inVet = segments[0] === '(vet)';
    const inStore = segments[0] === '(store)';
    const inSupport = segments[0] === '(support)';
    const inTrainer = segments[0] === '(trainer)';
    const inWalker = (segments[0] as string) === '(walker)';

    // Anonymous "browse without an account" session — only allowed inside (guest).
    if (isGuest) {
      if (!inGuest) router.replace('/(guest)' as any);
      return;
    }

    if (!user && !inAuth) {
      router.replace('/(auth)');
      return;
    }

    if (user) {
      const u = user as any;
      if (u.profileComplete === false && segments[1] !== 'complete-profile') {
        router.replace('/(auth)/complete-profile');
        return;
      }
      const role = user.role;
      if (inAuth) {
        if (role === 'owner') router.replace('/(owner)');
        else if (role === 'vet') router.replace('/(vet)');
        else if (role === 'store') router.replace('/(store)');
        else if (role === 'trainer') router.replace('/(trainer)');
        else if (role === 'support') router.replace('/(support)');
        else if (role === 'walker') (router.replace as any)('/(walker)');
        else if (role === 'grooming') (router.replace as any)('/(grooming)');
      }
    }
  }, [user, isGuest, loading, segments]);

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
            <Stack.Screen name="(guest)" />
            <Stack.Screen name="(owner)" />
            <Stack.Screen name="(vet)" />
            <Stack.Screen name="(store)" />
            <Stack.Screen name="(trainer)" />
            <Stack.Screen name="(support)" />
            <Stack.Screen name="(walker)" />
            <Stack.Screen name="(grooming)" />
          </Stack>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
