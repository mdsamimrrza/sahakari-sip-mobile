// ============================================================
// SahakariSIP — Data mode toggle (Cloud vs On-device)
// ============================================================

import React from "react";
import { View, Pressable } from "react-native";
import { useTheme, radius } from "../../theme";
import { Text } from "../ui/primitives";
import { useAuth } from "../../lib/auth/AuthContext";
import type { DataMode } from "../../lib/data/store";

export function DataModeToggle({
  mode,
  onChange,
}: {
  mode: DataMode;
  onChange: (mode: DataMode) => void;
}) {
  const { colors } = useTheme();
  const { cloudAvailable } = useAuth();

  const options: Array<{ value: DataMode; label: string }> = [
    { value: "cloud", label: "Cloud account" },
    { value: "local", label: "On this device" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.muted,
        borderRadius: radius.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        const disabled = opt.value === "cloud" && !cloudAvailable;
        return (
          <Pressable
            key={opt.value}
            onPress={() => !disabled && onChange(opt.value)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: radius.md,
              alignItems: "center",
              backgroundColor: active ? colors.primary : "transparent",
              opacity: disabled ? 0.45 : 1,
            }}
          >
            <Text
              variant="caption"
              color={active ? colors.primaryForeground : colors.mutedForeground}
              style={{ fontWeight: "800" }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
