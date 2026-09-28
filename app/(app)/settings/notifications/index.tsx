// ============================================================
// SahakariSIP — Settings → Notifications (hub)
// ============================================================
// Second-level nesting: Push Reminders and Email Summaries are their
// own sub-pages (notifications/push, notifications/email) so the hub
// stays a clean menu like the reference mock.
// ============================================================

import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Smartphone, Mail, Sparkles } from "lucide-react-native";
import { useTheme, spacing, fontSize } from "@/theme";
import { Text } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { SettingsDetailHeader, SettingsGroup, SettingsRow } from "@/components/settings/menu";

export default function SettingsNotificationsHub() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Notifications"
          subtitle="Reminders and summaries"
        />
      }
    >
      <SettingsGroup title="Channels">
        <SettingsRow
          tint={colors.info}
          icon={<Smartphone size={18} color={colors.info} strokeWidth={2} />}
          label="Push Reminders"
          onPress={() => router.push("/(app)/settings/notifications/push")}
        />
        <SettingsRow
          tint={colors.purple}
          icon={<Mail size={18} color={colors.purple} strokeWidth={2} />}
          label="Email Summaries"
          last
          onPress={() => router.push("/(app)/settings/notifications/email")}
        />
      </SettingsGroup>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          padding: spacing.lg,
          borderRadius: 16,
          backgroundColor: colors.card,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <Sparkles size={15} color={colors.amber} />
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ flex: 1, fontSize: fontSize.sm }}
        >
          Standard schedule: alerts go out{" "}
          <Text variant="caption" style={{ fontWeight: "800" }}>
            2 days before &amp; on your installment date
          </Text>
          .
        </Text>
      </View>
    </Screen>
  );
}
