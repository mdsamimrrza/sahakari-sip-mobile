// ============================================================
// SahakariSIP — Auth shell
// ============================================================
// Centred, keyboard-aware canvas with the stacked logo above the card.
// Mirrors the web app's (auth)/layout.tsx.
// ============================================================

import React from "react";
import { View, ScrollView, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "../../theme";
import { LogoStack } from "./AppLogo";

export function AuthShell({
  children,
  compact,
}: {
  children: React.ReactNode;
  /** Tight variant that fits one screen without scrolling (login). */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -90,
          right: -70,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: colors.primary,
          opacity: 0.08,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -110,
          left: -80,
          width: 240,
          height: 240,
          borderRadius: 120,
          backgroundColor: colors.secondary,
          opacity: 0.1,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: spacing.lg,
            paddingTop: insets.top + (compact ? spacing.md : spacing.xl),
            paddingBottom: insets.bottom + (compact ? spacing.lg : spacing.xxxl),
            gap: compact ? spacing.md : spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LogoStack compact={compact} />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
