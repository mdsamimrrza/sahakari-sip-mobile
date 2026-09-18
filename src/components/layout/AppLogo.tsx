// ============================================================
// SahakariSIP — App logo
// ============================================================
// Vector port of the web app's icon.svg: an indigo rounded tile with
// white bars and a rising arrow.
// ============================================================

import React from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useTheme, fontSize } from "../../theme";
import { Text } from "../ui/primitives";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect width="32" height="32" rx="9" fill="#1E6B48" stroke="#16211B" strokeWidth="2" />
      <Rect x="6" y="21" width="4.5" height="5.5" rx="1.5" fill="#F6F4EE" opacity="0.6" />
      <Rect x="13.5" y="13" width="4.5" height="13.5" rx="1.5" fill="#F6F4EE" opacity="0.8" />
      <Rect x="21" y="6" width="4.5" height="20.5" rx="1.5" fill="#F6F4EE" />
      <Path
        d="M4 23.5L11 16.5L16 19.5L26 9.5"
        stroke="#F6F4EE"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M22 8.5H27.5V14"
        stroke="#F6F4EE"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
export function LogoStack() {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <LogoMark size={64} />
      <Text variant="heading" style={{ fontSize: fontSize.xxl, fontWeight: "900" }}>
        Sahakari
        <Text
          variant="heading"
          style={{ fontSize: fontSize.xxl, fontWeight: "900" }}
          color={colors.secondary}
        >
          SIP
        </Text>
      </Text>
      <Text
        variant="micro"
        color={colors.mutedForeground}
        style={{ letterSpacing: 1.2 }}
      >
        Mutual Fund Portfolio Ledger
      </Text>
    </View>
  );
}
