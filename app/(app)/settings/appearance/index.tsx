// ============================================================
// SahakariSIP — Settings → Appearance
// ============================================================
// Light / Dark / System — persists to AsyncStorage via ThemeProvider.
// (The web app uses next-themes; this is the mobile equivalent.)
// ============================================================

import React from "react";
import { Pressable, View } from "react-native";
import { Sun, Moon, Smartphone } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize, type ThemeMode } from "@/theme";
import { Text, Card } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  hint: string;
  tintKey: "amber" | "info" | "purple";
  render: (color: string) => React.ReactNode;
}> = [
  { value: "light", label: "Light", hint: "Mist & pine", tintKey: "amber", render: (c) => <Sun size={17} color={c} /> },
  { value: "dark", label: "Dark", hint: "Night terrace", tintKey: "info", render: (c) => <Moon size={17} color={c} /> },
  { value: "system", label: "System", hint: "Follow device", tintKey: "purple", render: (c) => <Smartphone size={17} color={c} /> },
];

export default function SettingsAppearanceScreen() {
  const { colors, mode, setMode } = useTheme();

  return (
    <Screen header={<SettingsDetailHeader title="Appearance" subtitle="Light, dark, or follow your system" />}>
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
            title="Theme"
            subtitle="Mist and pine in light, night terrace in dark."
          />
          <View style={{ gap: spacing.sm }}>
            {OPTIONS.map((opt) => {
              const active = mode === opt.value;
              const tint = colors[opt.tintKey];
              return (
                <Pressable key={opt.value} onPress={() => setMode(opt.value)}>
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.md,
                        padding: spacing.md,
                        borderRadius: radius.xl,
                        borderWidth: 1.5,
                        borderColor: active ? tint : colors.border,
                        backgroundColor: active ? `${tint}14` : colors.muted,
                        opacity: pressed ? 0.75 : 1,
                      }}
                    >
                      <View
                        style={{
                          height: 36,
                          width: 36,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: `${tint}1F`,
                        }}
                      >
                        {opt.render(active ? tint : colors.mutedForeground)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="label" style={{ fontWeight: "800" }}>
                          {opt.label}
                        </Text>
                        <Text variant="caption" color={colors.mutedForeground}>
                          {opt.hint}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: active ? tint : colors.border,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {active ? (
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: tint,
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ fontSize: fontSize.xs }}
          >
            System follows your phone&apos;s light / dark setting automatically.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
