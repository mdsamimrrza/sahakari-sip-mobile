// ============================================================
// SahakariSIP — Auth shell
// ============================================================
// Centred, keyboard-aware canvas with the stacked logo above the card.
// Mirrors the web app's (auth)/layout.tsx.
// ============================================================

import React from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing } from "../../theme";
import { LogoStack } from "./AppLogo";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: spacing.lg,
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xxxl,
            gap: spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LogoStack />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
