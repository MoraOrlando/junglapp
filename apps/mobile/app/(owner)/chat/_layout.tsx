import { Stack } from 'expo-router';

// Several screens outside this tab (appointment detail, home, orders, match,
// lost pet) push straight into chat/[id] without the user ever visiting
// chat/index first. Without anchoring index as the initial route, expo-router
// has no "list" entry in this stack's history to pop back to — navigating to
// '/(owner)/chat' from [id] just pushes a second index on top of the
// orphaned [id] screen instead of really going back.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ChatLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
