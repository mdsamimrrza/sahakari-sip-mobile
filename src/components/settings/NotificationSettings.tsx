// ============================================================
// SahakariSIP — Installment Reminders
// ============================================================
// Mobile port of `src/components/settings/notification-settings.tsx`.
//
// The web app's "Mobile Push" channel uses Web Push (VAPID + a service
// worker). On native the equivalent is an OS notification permission, so
// the toggle requests `POST_NOTIFICATIONS` via expo-notifications. The
// email channel mirrors the web app exactly and persists to the same
// `notification_preferences` row.
//
// Every notification call is wrapped defensively: a release APK built
// without FCM credentials still lets the user flip the switch, it just
// reports honestly that the OS hasn't granted delivery.
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import Constants from "expo-constants";
import { Bell, Smartphone, Mail, Sparkles } from "lucide-react-native";

import { useTheme, radius, spacing, fontSize } from "../../theme";
import { useAuth } from "../../lib/auth/AuthContext";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "../../lib/data/store";
import type { NotificationPreferences } from "../../lib/types";
import {
  Text,
  Card,
  CardHeader,
  CardTitle,
  Badge,
  Switch,
  Separator,
} from "../ui/primitives";
import { useToast } from "../ui/overlays";

type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

/**
 * Expo Go removed remote push support in SDK 53 — importing
 * expo-notifications there throws DURING module evaluation, which Metro's
 * import machinery doesn't reliably catch (uncaught crash). Detect Expo Go
 * up front and never load the module in it; the installed APK/development
 * build has full native notification support.
 */
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

async function readPushPermission(): Promise<PermissionState> {
  if (isExpoGo()) return "unsupported";
  try {
    const Notifications = await import("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    if (status === "denied") return "denied";
    return "undetermined";
  } catch {
    return "unsupported";
  }
}

// ---------- Channel row (module-level so it never remounts) ----------

function ChannelRow({
  icon,
  iconColor,
  title,
  badge,
  description,
  value,
  onToggle,
  disabled,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  badge: { label: string; color: string } | null;
  description: React.ReactNode;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
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
            height: 32,
            width: 32,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: iconColor,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.xs,
              flexWrap: "wrap",
            }}
          >
            <Text variant="label" style={{ fontSize: fontSize.base }}>
              {title}
            </Text>
            {badge ? (
              <Badge bg={`${badge.color}1F`} color={badge.color}>
                {badge.label}
              </Badge>
            ) : null}
          </View>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            {description}
          </Text>
        </View>
      </View>
      <Switch value={value} onValueChange={onToggle} disabled={disabled} />
    </View>
  );
}

export function NotificationSettings({ userEmail }: { userEmail: string }) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // ---------- Load saved preferences ----------
  useEffect(() => {
    let active = true;
    (async () => {
      if (store) {
        try {
          const saved = await store.getNotificationPreferences();
          if (active) setPrefs(saved);
        } catch {
          // keep the defaults
        }
      }
      const perm = await readPushPermission();
      if (active) {
        setPermission(perm);
        setIsInitialLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [store]);

  const isPushActive = prefs.push_enabled && permission === "granted";
  const activeChannelsCount = (isPushActive ? 1 : 0) + (prefs.email_enabled ? 1 : 0);

  const persist = useCallback(
    async (next: NotificationPreferences) => {
      setPrefs(next);
      if (!store) return;
      setIsSaving(true);
      const res = await store.saveNotificationPreferences(next);
      if (!res.success) {
        toast({
          title: "Couldn't save preferences",
          description: res.error ?? "Please try again.",
          variant: "destructive",
        });
      }
      setIsSaving(false);
    },
    [store, toast]
  );

  async function handleTogglePush() {
    if (isPushLoading) return;

    // Turning it off is always allowed — no permission needed.
    if (prefs.push_enabled) {
      await persist({ ...prefs, push_enabled: false });
      return;
    }

    setIsPushLoading(true);

    // Expo Go can't load expo-notifications at all (SDK 53 removed remote
    // push there) — report honestly instead of crashing on import.
    if (isExpoGo()) {
      setPermission("unsupported");
      toast({
        title: "Push unavailable in Expo Go",
        description:
          "Expo Go removed remote push support. Install the APK build to receive reminders.",
        variant: "destructive",
      });
      setIsPushLoading(false);
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
          description: "Enable notifications for SahakariSIP in your device settings.",
          variant: "destructive",
        });
      }
    } catch {
      setPermission("unsupported");
      toast({
        title: "Push unavailable",
        description:
          "This build can't register for push notifications. Email reminders still work.",
        variant: "destructive",
      });
    }
    setIsPushLoading(false);
  }

  async function handleToggleEmail() {
    await persist({ ...prefs, email_enabled: !prefs.email_enabled });
  }

  // ---------- Render ----------

  return (
    <Card>
      <CardHeader
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingBottom: spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
            <View
              style={{
                height: 32,
                width: 32,
                borderRadius: radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.amber,
              }}
            >
              <Bell size={16} color={colors.amber} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                <Text variant="label" style={{ fontWeight: "900" }}>
                  Installment Reminders
                </Text>
                <Badge bg={`${colors.amber}1F`} color={colors.amber}>
                  Standard
                </Badge>
              </View>
              <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs, marginTop: 2 }}>
                Automatic monthly SIP deposit alerts via mobile push and email.
              </Text>
            </View>
          </View>

          <Badge
            bg={activeChannelsCount > 0 ? `${colors.success}1F` : colors.muted}
            color={activeChannelsCount > 0 ? colors.success : colors.mutedForeground}
          >
            {activeChannelsCount > 0 ? `${activeChannelsCount} Active` : "Off"}
          </Badge>
        </View>
      </CardHeader>

      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <ChannelRow
          icon={<Smartphone size={16} color={colors.info} />}
          iconColor={colors.info}
          title="Mobile Push Notifications"
          badge={
            isPushActive
              ? { label: "● Active", color: colors.success }
              : permission === "denied"
                ? { label: "Blocked", color: colors.rose }
                : permission === "unsupported"
                  ? { label: "Unavailable", color: colors.rose }
                  : { label: "Inactive", color: colors.mutedForeground }
          }
          description="Native lock-screen alerts on your phone when an installment is due."
          value={isPushActive}
          onToggle={handleTogglePush}
          disabled={isPushLoading || isInitialLoading || permission === "unsupported"}
        />

        <ChannelRow
          icon={<Mail size={16} color={colors.purple} />}
          iconColor={colors.purple}
          title="Email Notifications"
          badge={
            prefs.email_enabled
              ? { label: "● Active", color: colors.success }
              : { label: "Disabled", color: colors.mutedForeground }
          }
          description={
            <>
              Statements sent to{" "}
              <Text
                variant="caption"
                color={colors.foreground}
                style={{ fontSize: fontSize.xs, fontWeight: "700" }}
              >
                {userEmail}
              </Text>
            </>
          }
          value={prefs.email_enabled}
          onToggle={handleToggleEmail}
          disabled={isSaving || isInitialLoading}
        />

        <Separator style={{ marginTop: spacing.xs }} />

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.lg,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Sparkles size={14} color={colors.amber} />
          <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, fontSize: fontSize.xs }}>
            Standard Schedule: Alerts are sent automatically{" "}
            <Text variant="caption" color={colors.foreground} style={{ fontSize: fontSize.xs, fontWeight: "800" }}>
              2 days before &amp; on your installment date
            </Text>
            .
          </Text>
        </View>
      </View>
    </Card>
  );
}
