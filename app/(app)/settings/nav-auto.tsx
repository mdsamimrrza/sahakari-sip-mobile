// ============================================================
// SahakariSIP — Settings → Auto-update NAV prices
// ============================================================
// Device-mode convenience toggle: when on, the app pulls the latest
// published NAV prices once a day from the app's own public feed and
// advances each fund's latest value ONLY when the quote is
// newer-dated. Manual corrections always win; nothing personal ever
// leaves the phone. Cloud mode is untouched — it updates on the
// server automatically.
// ============================================================

import React, { useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { TrendingUp } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { isNavAutoEnabled, setNavAutoEnabled } from "@/lib/data/local";

export default function SettingsNavAutoScreen() {
  const { colors } = useTheme();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    isNavAutoEnabled().then(setEnabled);
  }, []);

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Auto-update NAV prices"
          subtitle="Keep device-mode NAV values current"
        />
      }
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
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          {/* Toggle */}
          <Pressable
            onPress={() => {
              const next = !enabled;
              setEnabled(next);
              void setNavAutoEnabled(next);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.primary}1F`,
              }}
            >
              <TrendingUp size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label">Update NAV prices automatically</Text>
              <Text variant="caption" color={colors.mutedForeground}>
                {enabled ? "On - fetched once a day" : "Off - update manually"}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(next) => {
                setEnabled(next);
                void setNavAutoEnabled(next);
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor="#FFFFFF"
            />
          </Pressable>

          <View style={{ gap: spacing.md }}>
            <SectionHeader title="What this does" />
            <Text variant="caption" color={colors.mutedForeground} style={{ lineHeight: 19 }}>
              When this is on and you use SahakariSIP in device (offline)
              mode, the app fetches the latest published mutual-fund NAV
              prices once a day from the app's own server feed - the same
              validated prices cloud users receive.
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ lineHeight: 19 }}>
              Each price is applied only to funds you track, and only when
              its date is newer than the value you already have. Your own
              manual corrections always win, and a fetched price can never
              overwrite a newer one.
            </Text>
            <SectionHeader title="What it does not do" />
            <Text variant="caption" color={colors.mutedForeground} style={{ lineHeight: 19 }}>
              It never sends any of your data anywhere - the request is a
              plain download of public prices with no account attached. It
              does not create entries, place orders, or change anything
              except the displayed latest NAV. Turn it off and device mode
              is fully manual again.
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ lineHeight: 19 }}>
              Requires internet at the moment of the daily fetch. If the
              phone is offline, the update is simply skipped and retried
              the next time you open the app.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
