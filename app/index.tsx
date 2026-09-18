// ============================================================
// SahakariSIP — Landing screen
// ============================================================
// Port of the web app's src/app/page.tsx hero + feature grid.
// Signed-in users are sent straight to their dashboard.
// ============================================================

import React from "react";
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TrendingUp,
  PieChart,
  Calculator,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Button, Card } from "@/components/ui/primitives";
import { AppLogo } from "@/components/layout/AppLogo";
import { APP_TAGLINE } from "@/lib/constants";

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status } = useAuth();

  // Already signed in → go straight to the dashboard (mirrors the web redirect)
  React.useEffect(() => {
    if (status === "authenticated") {
      router.replace("/(app)/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  const features = [
    {
      icon: <TrendingUp size={20} color={colors.primary} />,
      bg: `${colors.primary}1A`,
      title: "Actual XIRR Returns",
      body:
        "Calculates true annualized internal rate of return using exact cash flow dates instead of simple averages.",
    },
    {
      icon: <PieChart size={20} color={colors.amber} />,
      bg: `${colors.amber}1A`,
      title: "Fee Drag Visibility",
      body:
        "See the cumulative cost of annual management, depository, and supervision fees over your investment horizon.",
    },
    {
      icon: <Calculator size={20} color={colors.success} />,
      bg: `${colors.success}1A`,
      title: "Step-Up Projections",
      body:
        "Simulate portfolio growth at 5, 10, 15, and 20 years seeded directly with your current corpus value.",
    },
    {
      icon: <ShieldCheck size={20} color={colors.purple} />,
      bg: `${colors.purple}1A`,
      title: "Private & Isolated",
      body:
        "Your data is protected by Supabase Row Level Security. Only you can view or modify your portfolio entries.",
    },
  ];

  const badges = [
    "Support for NMB, NIBL, SSIS & more",
    "Exact Newton-Raphson XIRR",
    "Row-Level Security (RLS) Isolation",
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={{ alignItems: "center", gap: spacing.md, paddingTop: spacing.xl }}>
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: `${colors.primary}14`,
            }}
          >
            <Text
              style={{ fontSize: fontSize.xs, fontWeight: "800", letterSpacing: 0.5 }}
              color={colors.primary}
            >
              BUILT FOR NEPALI MUTUAL FUND SIP INVESTORS
            </Text>
          </View>

          <Text variant="display" align="center">
            Track Your Nepali Mutual Fund SIPs with{" "}
            <Text variant="display" color={colors.secondary}>
              Precision &amp; Clarity
            </Text>
          </Text>

          <Text
            variant="body"
            align="center"
            color={colors.mutedForeground}
            style={{ maxWidth: 520 }}
          >
            “{APP_TAGLINE}” Real XIRR returns, portfolio growth projections, and
            true fee drag insights in one clean dashboard.
          </Text>

          <View style={{ width: "100%", gap: spacing.sm, marginTop: spacing.sm }}>
            <Button
              size="lg"
              fullWidth
              onPress={() => router.push("/(auth)/signup")}
            >
              <Text variant="label" color={colors.primaryForeground}>
                Start Tracking Free
              </Text>
              <ArrowRight size={18} color={colors.primaryForeground} />
            </Button>
            <Button
              size="lg"
              variant="outline"
              fullWidth
              onPress={() => router.push("/(auth)/login")}
            >
              Sign In
            </Button>
          </View>

          <View style={{ gap: spacing.sm, marginTop: spacing.md, width: "100%" }}>
            {badges.map((b) => (
              <View
                key={b}
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <CheckCircle2 size={16} color={colors.success} />
                <Text variant="caption" color={colors.mutedForeground}>
                  {b}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Feature grid */}
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text variant="heading" align="center">
              Everything you need to master your SIP portfolio
            </Text>
            <Text variant="caption" align="center" color={colors.mutedForeground}>
              Replace messy Excel sheets with a dedicated personal mutual fund
              dashboard.
            </Text>
          </View>

          {features.map((f) => (
            <Card key={f.title} padded>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.md,
                  backgroundColor: f.bg,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: spacing.sm,
                }}
              >
                {f.icon}
              </View>
              <Text variant="subheading" style={{ fontSize: fontSize.lg }}>
                {f.title}
              </Text>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ marginTop: 4, lineHeight: 18 }}
              >
                {f.body}
              </Text>
            </Card>
          ))}
        </View>

        {/* Footer */}
        <View style={{ alignItems: "center", gap: 4, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.mutedForeground} align="center">
            © {new Date().getFullYear()} SahakariSIP. Personal Mutual Fund Tracker.
          </Text>
          <Text variant="caption" color={colors.mutedForeground} align="center">
            Designed for Nepali open-ended mutual fund investors.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
