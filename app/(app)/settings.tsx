// ============================================================
// SahakariSIP — Settings
// ============================================================
// Mobile port of `src/app/(app)/settings/page.tsx`.
//
// The web app renders a 12-column grid; on a phone that collapses into
// a single column in this order:
//   1. Account Settings header
//   2. Fund Configurations      (FundConfigForm)
//   3. Installment Reminders    (NotificationSettings)
//   4. Portfolio Owner card     (profile + tracked funds + protection)
//   5. Appearance               (mobile-only extra — web uses next-themes)
//   6. Tax & Settlement entry point
//   7. Danger Zone              (DeleteAccountDialog)
// ============================================================

import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Settings as SettingsIcon,
  User,
  ShieldCheck,
  Coins,
  Building2,
  Receipt,
  ChevronRight,
  Sun,
  Moon,
  Smartphone,
  Cloud,
  HardDrive,
  LogOut,
} from "lucide-react-native";

import { useTheme, radius, spacing, fontSize, type ThemeMode } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { useFunds } from "@/hooks/useData";
import { formatRelativeDate } from "@/lib/format";
import { initialOf } from "@/lib/utils";
import {
  Text,
  Card,
  CardHeader,
  CardTitle,
  Badge,
  Avatar,
  Separator,
  Skeleton,
  Button,
} from "@/components/ui/primitives";
import { Screen, PageHeader, SectionHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { FundConfigForm } from "@/components/settings/FundConfigForm";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  render: (color: string) => React.ReactNode;
}> = [
  { value: "light", label: "Light", render: (c) => <Sun size={15} color={c} /> },
  { value: "dark", label: "Dark", render: (c) => <Moon size={15} color={c} /> },
  { value: "system", label: "System", render: (c) => <Smartphone size={15} color={c} /> },
];

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const router = useRouter();
  const { user, dataMode, cloudAvailable, sessionStartedAt, signOut } = useAuth();
  const { funds, loading } = useFunds();

  const userEmail = user?.email ?? "Authenticated User";
  const userName = user?.name || "Portfolio Owner";

  return (
    <Screen header={<AppHeader />}>
      {/* ---------- Header ---------- */}
      <Card
        style={{
          backgroundColor: colors.card,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            padding: spacing.xl,
          }}
        >
          <View
            style={{
              height: 48,
              width: 48,
              borderRadius: radius.xl,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${colors.success}22`,
              borderWidth: 2,
              borderColor: colors.success,
            }}
          >
            <SettingsIcon size={22} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" style={{ fontWeight: "900" }}>
              Account Settings
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: 2 }}>
              Manage your mutual fund configurations, installment reminders, and account
              profile.
            </Text>
          </View>
        </View>
      </Card>

      {/* ---------- 1. Fund configurations ---------- */}
      {loading ? (
        <Card padded>
          <Skeleton height={22} width="55%" />
          <View style={{ height: spacing.md }} />
          <Skeleton height={80} />
          <View style={{ height: spacing.sm }} />
          <Skeleton height={80} />
        </Card>
      ) : (
        <FundConfigForm funds={funds} />
      )}

      {/* ---------- 2. Installment reminders ---------- */}
      <NotificationSettings userEmail={userEmail} />

      {/* ---------- 3. Portfolio owner ---------- */}
      <Card>
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingBottom: spacing.lg,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Avatar initial={initialOf(userName)} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="label" numberOfLines={1} style={{ fontWeight: "900" }}>
                {userName}
              </Text>
              <Text variant="caption" color={colors.mutedForeground} numberOfLines={1}>
                {userEmail}
              </Text>
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.muted,
                borderWidth: 2,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Building2 size={14} color={colors.purple} />
                <Text variant="caption" color={colors.mutedForeground}>
                  Tracked Funds
                </Text>
              </View>
              <Text variant="mono" style={{ fontWeight: "800" }}>
                {funds.length} Active
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.muted,
                borderWidth: 2,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <ShieldCheck size={14} color={colors.success} />
                <Text variant="caption" color={colors.mutedForeground}>
                  Auth Protection
                </Text>
              </View>
              <Badge bg={`${colors.success}1F`} color={colors.success}>
                Secured
              </Badge>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.muted,
                borderWidth: 2,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                {dataMode === "cloud" ? (
                  <Cloud size={14} color={colors.info} />
                ) : (
                  <HardDrive size={14} color={colors.amber} />
                )}
                <Text variant="caption" color={colors.mutedForeground}>
                  Data Storage
                </Text>
              </View>
              <Badge
                bg={dataMode === "cloud" ? `${colors.info}1F` : `${colors.amber}1F`}
                color={dataMode === "cloud" ? colors.info : colors.amber}
              >
                {dataMode === "cloud" ? "Supabase Cloud" : "On this device"}
              </Badge>
            </View>

            {sessionStartedAt ? (
              <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
                Signed in {formatRelativeDate(sessionStartedAt)}
              </Text>
            ) : null}
          </View>

          <Button variant="outline" fullWidth onPress={() => signOut()}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
              }}
            >
              <LogOut size={16} color={colors.foreground} />
              <Text variant="label">Log Out</Text>
            </View>
          </Button>
        </View>
      </Card>

      {/* ---------- 4. Appearance ---------- */}
      <Card>
        <CardHeader>
          <CardTitle style={{ fontSize: fontSize.lg, fontWeight: "900" }}>
            Appearance
          </CardTitle>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ marginTop: 4, fontSize: fontSize.sm }}
          >
            Paper & ink in light, carbon & chalk in dark.
          </Text>
        </CardHeader>

        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}>
          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              padding: spacing.xs,
              borderRadius: radius.xl,
              backgroundColor: colors.muted,
              borderWidth: 2,
              borderColor: colors.border,
            }}
          >
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setMode(opt.value)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.card : "transparent",
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.border,
                  }}
                >
                  {opt.render(active ? colors.foreground : colors.mutedForeground)}
                  <Text
                    variant="caption"
                    color={active ? colors.foreground : colors.mutedForeground}
                    style={{ fontWeight: active ? "800" : "600" }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      {/* ---------- 5. Tax & Settlement entry point ---------- */}
      <Pressable onPress={() => router.push("/(app)/tax-breakdown")}>
        {({ pressed }) => (
          <Card
            style={{
              borderColor: colors.success,
              opacity: pressed ? 0.9 : 1,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.xl,
              }}
            >
              <View
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: radius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.success}22`,
                  borderWidth: 2,
                  borderColor: colors.success,
                }}
              >
                <Receipt size={19} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" style={{ fontWeight: "900" }}>
                  Tax &amp; Settlement Ledger
                </Text>
                <Text variant="caption" color={colors.mutedForeground}>
                  Full audit: deposits, DP charges, AMC drag, CGT and net bank payout.
                </Text>
              </View>
              <ChevronRight size={18} color={colors.mutedForeground} />
            </View>
          </Card>
        )}
      </Pressable>

      {/* ---------- 6. Danger zone ---------- */}
      <DeleteAccountDialog />

      {/* ---------- About ---------- */}
      <Card padded>
        <SectionHeader
          title="About SahakariSIP"
          subtitle={`Version 1.0.0 · ${cloudAvailable ? "Cloud ready" : "Offline only"}`}
        />
        <Separator style={{ marginVertical: spacing.md }} />
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Coins size={14} color={colors.secondary} />
            <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, fontSize: fontSize.xs }}>
              SEBON-accurate whole-unit allotment with a refundable SIP Rollover Wallet.
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <User size={14} color={colors.secondary} />
            <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, fontSize: fontSize.xs }}>
              XIRR (Newton-Raphson), SIP streak tracking, and lot-based capital gains tax.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}
