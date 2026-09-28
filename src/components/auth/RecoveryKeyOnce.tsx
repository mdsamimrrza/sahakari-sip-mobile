// ============================================================
// SahakariSIP — One-time recovery key display
// ============================================================
// Shown exactly once after a device-mode account is created (or a
// legacy profile is upgraded): the recovery key is generated on
// device, never stored, and is the ONLY way to reset a forgotten
// password without wiping local data.
// ============================================================

import React, { useState } from "react";
import { Pressable, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy, ShieldCheck } from "lucide-react-native";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Button } from "@/components/ui/primitives";

export function RecoveryKeyOnce({
  recoveryKey,
  onDone,
}: {
  recoveryKey: string;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    await Clipboard.setStringAsync(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: `${colors.primary}40`,
        backgroundColor: `${colors.primary}08`,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <ShieldCheck size={20} color={colors.primary} />
        <Text variant="label" style={{ fontSize: fontSize.lg }}>
          Save your recovery key
        </Text>
      </View>

      <Text variant="caption" color={colors.mutedForeground}>
        This key is the only way to reset your password if you forget it.
        Write it down and keep it somewhere safe - it is never shown again
        and never leaves this phone.
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Text
          style={{
            fontSize: fontSize.lg,
            fontWeight: "800",
            letterSpacing: 1,
            color: colors.foreground,
          }}
        >
          {recoveryKey}
        </Text>
        <Pressable
          onPress={copyKey}
          accessibilityRole="button"
          accessibilityLabel="Copy recovery key"
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        >
          {copied ? (
            <Check size={18} color={colors.success} />
          ) : (
            <Copy size={18} color={colors.mutedForeground} />
          )}
        </Pressable>
      </View>

      {saved ? (
        <Button onPress={onDone}>
          Continue
        </Button>
      ) : (
        <Button variant="ghost" onPress={() => setSaved(true)}>
          I have written it down
        </Button>
      )}
    </View>
  );
}
