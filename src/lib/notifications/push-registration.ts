// ============================================================
// SahakariSIP - Expo push token registration (per account)
// ============================================================
// One row per user per device: every cloud account that signs in on this
// device registers its own row (same token, different user_id), so each
// account receives server push independently. Called automatically after
// sign-in, on every app open, and from Settings > Notifications > Push
// Reminders.
//
// Pass { prompt: true } on first sign-in so the OS notification permission
// dialog shows right there instead of requiring the settings toggle.
// App-open refreshes stay silent (no prompt); the settings toggle prompts
// on its own.
// ============================================================

import { Platform } from "react-native";
import Constants from "expo-constants";

// Expo Go removed remote push in SDK 53 - importing expo-notifications
// there throws at module init (its auto-registration side effect). Skip
// the import entirely in Expo Go; real builds get the handler.
const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

// Foreground delivery: without a registered handler, expo-notifications
// silently DROPS pushes that arrive while the app is OPEN (background
// pushes are unaffected). SpendFlow sets the same handler in its layout.
if (Platform.OS !== "web" && !isExpoGo) {
  import("expo-notifications")
    .then((Notifications) => {
      if (!Notifications?.setNotificationHandler) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    })
    .catch(() => { });
}

const ADMIN_PUSH_TOKEN_URL = "https://master-admin-delta.vercel.app/api/mobile/push-token";
const EXPO_PROJECT_ID = "8ed969e7-c29d-4ad1-9f1f-e9b4368ddc34";
// Must match the channelId the admin announce route sends. We post into our
// own channel because the default FCM fallback channel ("Miscellaneous") can
// get user-blocked on a device and Android makes it permanently silent -
// pushes would land there and never show.
export const PUSH_CHANNEL_ID = "announcements";

async function ensurePushChannel(): Promise<void> {
  const Notifications = await import("expo-notifications");
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Announcements",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function autoRegisterPushToken(
  userId: string | null | undefined,
  opts?: { prompt?: boolean }
): Promise<void> {
  if (!userId) return;
  try {
    const { default: Constants } = await import("expo-constants");
    if (
      Constants.appOwnership === "expo" ||
      Constants.executionEnvironment === "storeClient"
    ) {
      return; // Expo Go has no remote push
    }
    const Notifications = await import("expo-notifications");
    await ensurePushChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      if (!opts?.prompt) return;
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return; // blocked in OS settings - nothing to register
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    if (!tokenData?.data) return;
    const res = await fetch(ADMIN_PUSH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: tokenData.data,
        userId,
        platform: Constants.platform?.ios ? "ios" : "android",
      }),
    });
    if (!res.ok) console.warn("[push] auto-register rejected:", res.status);
  } catch (err) {
    console.warn("[push] auto-register failed:", err);
  }
}

export async function unregisterPushTokenForUser(
  userId: string | null | undefined
): Promise<void> {
  try {
    const { default: Constants } = await import("expo-constants");
    if (
      Constants.appOwnership === "expo" ||
      Constants.executionEnvironment === "storeClient"
    ) {
      return;
    }
    const Notifications = await import("expo-notifications");
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    if (!tokenData?.data) return;
    await fetch(ADMIN_PUSH_TOKEN_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenData.data, userId: userId ?? undefined }),
    });
  } catch (err) {
    console.warn("[push] unregister failed:", err);
  }
}
