// ============================================================
// SahakariSIP — Settings → Notifications → Push Reminders
// ============================================================
// Native OS permission via expo-notifications (lazy import so Expo Go,
// which removed remote push in SDK 53, reports honestly instead of
// crashing). Mirrors the web app's "Mobile Push" channel.
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { Smartphone } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/data/store";
import type { NotificationPreferences } from "@/lib/types";
import { Text, Card, Badge, Switch } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { useToast } from "@/components/ui/overlays";

type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

function isExpoGo(): boolean {
  try {
    return (
      Constants.appOwnership === "expo" ||
      Constants.executionEnvironment === "storeClient"
    );
  } catch {
    return false;
  }
}

export default function PushRemindersScreen() {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (store) {
        try {
          const saved = await store.getNotificationPreferences();
          if (active) setPrefs(saved);
        } catch {
          // defaults
        }
      }
      if (isExpoGo()) {
        if (active) setPermission("unsupported");
        return;
      }
      try {
        const Notifications = await import("expo-notifications");
        const { status } = await Notifications.getPermissionsAsync();
        if (!active) return;
        setPermission(
          status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined"
        );
      } catch {
        if (active) setPermission("unsupported");
      }
    })();
    return () => {
      active = false;
    };
  }, [store]);

  const persist = useCallback(
    async (next: NotificationPreferences) => {
      setPrefs(next);
      if (!store) return;
      const res = await store.saveNotificationPreferences(next);
      if (!res.success) {
        toast({
          title: "Couldn't save preferences",
          description: res.error ?? "Please try again.",
          variant: "destructive",
        });
      }
    },
    [store, toast]
  );

  async function handleToggle() {
    if (busy) return;
    if (prefs.push_enabled) {
      await persist({ ...prefs, push_enabled: false });
      return;
    }
    setBusy(true);
    if (isExpoGo()) {
      setPermission("unsupported");
      toast({
        title: "Push unavailable in Expo Go",
        description: "Install the APK build to receive reminders.",
        variant: "destructive",
      });
      setBusy(false);
      return;
    }
    try {
      const Notifications = await import("expo-notifications");
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status === "granted") {
        setPermission("granted");
        await persist({ ...prefs, push_enabled: true });
        toast({
          title: "Push reminders enabled",
          description: "You'll be alerted before each installment is due.",
          variant: "success",
        });
      } else {
        setPermission("denied");
        toast({
          title: "Notifications blocked",
          description: "Enable notifications for SahakariSIP in device settings.",
          variant: "destructive",
        });
      }
    } catch {
      setPermission("unsupported");
      toast({
        title: "Push unavailable",
        description: "This build can't register for push. Email still works.",
        variant: "destructive",
      });
    }
    setBusy(false);
  }

  const isActive = prefs.push_enabled && permission === "granted";

  return (
    <Screen
      header={<SettingsDetailHeader title="Push Reminders" subtitle="Lock-screen alerts" />}
    >
      <Card
        style={{
          borderWidth: 0,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="Mobile Push"
            subtitle="Native lock-screen alerts when an installment is due."
            right={
              <Badge
                bg={
                  isActive
                    ? `${colors.success}1F`
                    : permission === "denied" || permission === "unsupported"
                      ? `${colors.rose}1F`
                      : colors.muted
                }
                color={
                  isActive
                    ? colors.success
                    : permission === "denied" || permission === "unsupported"
                      ? colors.rose
                      : colors.mutedForeground
                }
              >
                {isActive
                  ? "Active"
                  : permission === "denied"
                    ? "Blocked"
                    : permission === "unsupported"
                      ? "Unavailable"
                      : "Off"}
              </Badge>
            }
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.muted,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
              <View
                style={{
                  height: 34,
                  width: 34,
                  borderRadius: radius.md,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.info,
                }}
              >
                <Smartphone size={16} color={colors.info} />
              </View>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ flex: 1, fontSize: fontSize.sm }}
              >
                Sent 2 days before &amp; on your installment date.
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={handleToggle}
              disabled={busy || permission === "unsupported"}
            />
          </View>
          {permission === "denied" ? (
            <Text variant="caption" color={colors.rose}>
              The OS blocked notifications — enable them for SahakariSIP in
              your device settings, then flip this switch again.
            </Text>
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}
