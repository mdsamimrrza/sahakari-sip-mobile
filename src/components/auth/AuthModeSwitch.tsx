// ============================================================
// SahakariSIP — Auth mode switch (login / signup top-right)
// ============================================================
// Shows the mode you can switch TO: "Local" while on cloud login,
// "Cloud" while on the on-device form. Filled with the primary color
// so the current escape hatch is always visible.
// ============================================================

import React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cloud, Smartphone } from "lucide-react-native";
import type { DataMode } from "@/lib/data/store";
import { useTheme, spacing, fontSize, radius } from "@/theme";
import { Text } from "@/components/ui/primitives";

export function AuthModeSwitch({
  mode,
  onSwitch,
}: {
  mode: DataMode;
  onSwitch: (next: DataMode) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const target: DataMode = mode === "cloud" ? "local" : "cloud";

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + 8,
        left: 0,
        right: 0,
        zIndex: 10,
        elevation: 10,
        alignItems: "flex-end",
        paddingRight: spacing.md,
      }}
    >
      <Pressable
        onPress={() => onSwitch(target)}
        accessibilityRole="button"
        accessibilityLabel={`Switch to ${target === "local" ? "on-device" : "cloud"} login`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: spacing.md,
          paddingVertical: 9,
          borderRadius: radius.full,
          backgroundColor: colors.primary,
          opacity: pressed ? 0.8 : 1,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 3,
        })}
      >
        {target === "local" ? (
          <Smartphone size={15} color={colors.primaryForeground} />
        ) : (
          <Cloud size={15} color={colors.primaryForeground} />
        )}
        <Text
          style={{ fontSize: fontSize.sm, fontWeight: "800" }}
          color={colors.primaryForeground}
        >
          {target === "local" ? "Local" : "Cloud"}
        </Text>
      </Pressable>
    </View>
  );
}
