// ============================================================
// SahakariSIP — Settings → Notifications → Email Summaries
// ============================================================
// Persists to the same `notification_preferences` row as the web app.
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Mail } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/lib/data/store";
import type { NotificationPreferences } from "@/lib/types";
import { Text, Card, Badge, Switch } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { useToast } from "@/components/ui/overlays";

export default function EmailSummariesScreen() {
  const { colors } = useTheme();
  const { store, user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [saving, setSaving] = useState(false);

  const userEmail = user?.email ?? "your email";

  useEffect(() => {
    let active = true;
    (async () => {
      if (!store) return;
      try {
        const saved = await store.getNotificationPreferences();
        if (active) setPrefs(saved);
      } catch {
        // defaults
      }
    })();
    return () => {
      active = false;
    };
  }, [store]);

  const handleToggle = useCallback(async () => {
    const next = { ...prefs, email_enabled: !prefs.email_enabled };
    setPrefs(next);
    if (!store) return;
    setSaving(true);
    const res = await store.saveNotificationPreferences(next);
    setSaving(false);
    if (!res.success) {
      setPrefs(prefs);
      toast({
        title: "Couldn't save preferences",
        description: res.error ?? "Please try again.",
        variant: "destructive",
      });
    }
  }, [prefs, store, toast]);

  return (
    <Screen
      header={<SettingsDetailHeader title="Email Summaries" subtitle={userEmail} />}
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
            title="Email Notifications"
            subtitle={`Statements and alerts sent to ${userEmail}.`}
            right={
              <Badge
                bg={prefs.email_enabled ? `${colors.success}1F` : colors.muted}
                color={prefs.email_enabled ? colors.success : colors.mutedForeground}
              >
                {prefs.email_enabled ? "Active" : "Off"}
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
                  borderColor: colors.purple,
                }}
              >
                <Mail size={16} color={colors.purple} />
              </View>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ flex: 1, fontSize: fontSize.sm }}
              >
                Weekly summaries, installment alerts and reports.
              </Text>
            </View>
            <Switch value={prefs.email_enabled} onValueChange={handleToggle} disabled={saving} />
          </View>
        </View>
      </Card>
    </Screen>
  );
}
