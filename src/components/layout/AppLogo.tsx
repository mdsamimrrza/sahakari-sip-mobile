// ============================================================
// SahakariSIP — App logo
// ============================================================
// The exact app icon (assets/icon.png), used everywhere inside the
// app: splash, header, auth screens, onboarding.
// ============================================================

import React from "react";
import { Image, View } from "react-native";
import { useTheme, fontSize } from "../../theme";
import { Text } from "../ui/primitives";

const ICON = require("../../../assets/icon.png");

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      source={ICON}
      style={{ width: size, height: size, borderRadius: size * (9 / 32) }}
      resizeMode="cover"
    />
  );
}

/** Logo mark + wordmark, matching the web app's `<Logo />`. */
export function AppLogo({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <LogoMark size={size} />
      <Text style={{ fontSize: size * 0.62, fontWeight: "900", letterSpacing: -0.4 }}>
        Sahakari
        <Text
          style={{ fontSize: size * 0.62, fontWeight: "900", letterSpacing: -0.4 }}
          color={colors.secondary}
        >
          SIP
        </Text>
      </Text>
    </View>
  );
}

/** Larger stacked version used on auth screens. */
export function LogoStack({ compact }: { compact?: boolean } = {}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: compact ? 6 : 10 }}>
      <LogoMark size={compact ? 48 : 64} />
      <Text variant="heading" style={{ fontSize: compact ? fontSize.lg : fontSize.xxl, fontWeight: "900" }}>
        Sahakari
        <Text
          variant="heading"
          style={{ fontSize: compact ? fontSize.lg : fontSize.xxl, fontWeight: "900" }}
          color={colors.secondary}
        >
          SIP
        </Text>
      </Text>
      {compact ? null : (
        <Text
          variant="micro"
          color={colors.mutedForeground}
          style={{ letterSpacing: 1.2 }}
        >
          Mutual Fund Portfolio Ledger
        </Text>
      )}
    </View>
  );
}
