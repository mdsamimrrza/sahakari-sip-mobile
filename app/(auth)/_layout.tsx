// ============================================================
// SahakariSIP — Auth route group layout
// ============================================================

import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@/theme";

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
