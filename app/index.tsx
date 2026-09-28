// ============================================================
// SahakariSIP — Landing screen
// ============================================================
// Port of the web app's src/app/page.tsx hero + feature grid.
// Signed-in users are sent straight to their dashboard.
// ============================================================

import React from "react";
import { View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowRight,
  TrendingUp,
  Calculator,
  ShieldCheck,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Button } from "@/components/ui/primitives";
import { AppLogo } from "@/components/layout/AppLogo";
import { APP_TAGLINE } from "@/lib/constants";

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status } = useAuth();

  // Already signed in → go straight to the dashboard (mirrors the web redirect).
  // Locked → biometric lock screen instead of the login form.
  // useFocusEffect (not a plain effect): while the signup/login screens are
  // on top, this screen is unfocused and must NOT yank the user away —
  // the recovery-key display right after device signup depends on it.
  useFocusEffect(
    React.useCallback(() => {
      if (status === "authenticated") {
        router.replace("/(app)/dashboard");
      } else if (status === "locked") {
        router.replace("/(auth)/lock");
      }
    }, [status, router])
  );

  if (status === "loading" || status === "authenticated" || status === "locked") {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -80,
          right: -70,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: colors.primary,
          opacity: 0.07,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -100,
          left: -70,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: colors.secondary,
          opacity: 0.08,
        }}
      />
      {/* Top nav */}
      <View
        style={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: spacing.md,
          paddingHorizontal: spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <AppLogo size={26} />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button variant="ghost" size="sm" onPress={() => router.push("/(auth)/login")}>
            Sign in
          </Button>
          <Button size="sm" onPress={() => router.push("/(auth)/signup")}>
            Get Started
          </Button>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          justifyContent: "space-evenly",
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        }}
      >
        {/* Hero */}
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <AppLogo size={44} />
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: `${colors.primary}14`,
            }}
          >
            <Text
              style={{ fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 0.6 }}
              color={colors.primary}
            >
              NEPALI MUTUAL FUND SIP TRACKER
            </Text>
          </View>

          <Text variant="title" align="center" style={{ fontSize: fontSize.xxl }}>
            Track Your SIPs with Precision
          </Text>

          <Text
            variant="caption"
            align="center"
            color={colors.mutedForeground}
            style={{ fontSize: fontSize.sm }}
            numberOfLines={3}
          >
            {APP_TAGLINE} Watch all your monthly payments grow in one simple place.
          </Text>

          <View style={{ width: "100%", gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              fullWidth
              onPress={() => router.push("/(auth)/signup")}
            >
              <Text variant="label" color={colors.primaryForeground}>
                Start Tracking Free
              </Text>
              <ArrowRight size={17} color={colors.primaryForeground} />
            </Button>
            <Button
              variant="outline"
              fullWidth
              onPress={() => router.push("/(auth)/login")}
            >
              Sign In
            </Button>
          </View>

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, width: "100%" }}>
            {[
              { icon: TrendingUp, tint: colors.primary, label: "Real returns" },
              { icon: Calculator, tint: colors.amber, label: "Future growth" },
              { icon: ShieldCheck, tint: colors.success, label: "Private & safe" },
            ].map((f) => (
              <View
                key={f.label}
                style={{
                  flex: 1,
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: colors.card,
                  shadowColor: "#000",
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${f.tint}1F`,
                  }}
                >
                  <f.icon size={17} color={f.tint} />
                </View>
                <Text
                  variant="caption"
                  color={colors.mutedForeground}
                  align="center"
                  style={{ fontWeight: "700", fontSize: fontSize.xs }}
                >
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {[
              { n: "1", label: "Add your fund" },
              { n: "2", label: "Add payments" },
              { n: "3", label: "Watch growth" },
            ].map((s) => (
              <View
                key={s.n}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${colors.primary}1F`,
                  }}
                >
                  <Text
                    style={{ fontSize: fontSize.xs, fontWeight: "900" }}
                    color={colors.primary}
                  >
                    {s.n}
                  </Text>
                </View>
                <Text
                  variant="caption"
                  color={colors.mutedForeground}
                  style={{ fontWeight: "600", flexShrink: 1 }}
                  numberOfLines={2}
                >
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color={colors.mutedForeground} align="center">
            © {new Date().getFullYear()} SahakariSIP
          </Text>
        </View>
      </View>
    </View>
  );
}
