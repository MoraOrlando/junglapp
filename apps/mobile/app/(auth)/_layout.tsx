import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="register-owner" />
      <Stack.Screen name="register-vet" />
      <Stack.Screen name="register-store" />
    </Stack>
  );
}
