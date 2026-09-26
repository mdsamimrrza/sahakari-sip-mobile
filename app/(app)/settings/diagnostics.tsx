// ============================================================
// SahakariSIP — Settings → Diagnostics
// ============================================================
// Views the on-device diagnostic log (recent events written by the
// auth/vault/NAV/entry flows). Copy-all for bug reports; clear to
// start fresh. Contains no passwords or recovery keys.
// ============================================================

import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, Trash2 } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Button, Card } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { clearLogs, getLogs } from "@/lib/logger";

export default function SettingsDiagnosticsScreen() {
  const { colors } = useTheme();
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getLogs().then(setLines);
  }, []);

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Diagnostics"
          subtitle="Recent on-device events for troubleshooting"
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
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="Event log"
            subtitle={`${lines.length} recent entries (oldest first)`}
          />

          <ScrollView
            style={{
              maxHeight: 420,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.muted,
            }}
            contentContainerStyle={{ padding: spacing.md }}
          >
            {lines.length === 0 ? (
              <Text variant="caption" color={colors.mutedForeground}>
                No events logged yet.
              </Text>
            ) : (
              lines.map((line, i) => (
                <Text
                  key={i}
                  style={{
                    fontSize: fontSize.xs,
                    color: colors.foreground,
                    lineHeight: 16,
                  }}
                >
                  {line}
                </Text>
              ))
            )}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(lines.join("\n"));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              disabled={lines.length === 0}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
                paddingVertical: 12,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.muted,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {copied ? (
                <Check size={16} color={colors.success} />
              ) : (
                <Copy size={16} color={colors.mutedForeground} />
              )}
              <Text variant="caption" style={{ fontWeight: "700" }}>
                {copied ? "Copied" : "Copy log"}
              </Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                await clearLogs();
                setLines([]);
              }}
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
                paddingVertical: 12,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.muted,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Trash2 size={16} color={colors.destructive} />
              <Text variant="caption" style={{ fontWeight: "700", color: colors.destructive }}>
                Clear
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
