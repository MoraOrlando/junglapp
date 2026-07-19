import { Stack } from 'expo-router';

export default function GuestLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[category]" />
      <Stack.Screen name="profile/[type]/[id]" />
    </Stack>
  );
}
