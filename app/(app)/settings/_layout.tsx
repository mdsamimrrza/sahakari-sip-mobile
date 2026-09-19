import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="funds" options={{ title: "My Funds" }} />
      <Stack.Screen name="security" options={{ title: "Security" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="notifications/push" options={{ title: "Push Reminders" }} />
      <Stack.Screen name="notifications/email" options={{ title: "Email Summaries" }} />
      <Stack.Screen name="appearance" options={{ title: "Appearance" }} />
      <Stack.Screen name="help" options={{ title: "Help" }} />
      <Stack.Screen name="about" options={{ title: "About" }} />
      <Stack.Screen name="danger" options={{ title: "Danger Zone" }} />
    </Stack>
  );
}
