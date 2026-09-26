// ============================================================
// SahakariSIP — Settings hub (nested)
// ============================================================
// Grouped iOS-style menu matching the reference mock. Hub only
// navigates — content lives in sub-pages (profile, funds, security,
// notifications/push/email, appearance, help, about).
// ============================================================

import React, { useEffect, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  User,
  Building2,
  Lock,
  Bell,
  Palette,
  Receipt,
  CircleHelp,
  Star,
  TrendingUp,
  Globe,
  LogOut,
  ChevronRight,
} from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDashboard, useFunds } from "@/hooks/useData";
import { formatCurrencyWhole, formatRelativeDate } from "@/lib/format";
import { initialOf } from "@/lib/utils";
import { useProfilePhotoUri } from "@/lib/profilePhoto";
import { Text } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import {
  SettingsGroup,
  SettingsRow,
  SettingsHubHeader,
} from "@/components/settings/menu";
import { GoCloudCard } from "@/components/settings/GoCloudCard";

/** App website — opened from Settings → More → Website. */
const APP_WEBSITE_URL = "https://sahakari-sip.vercel.app";

const ROW_ICON_SIZE = 18;
const ROW_ICON_STROKE = 2;


export default function SettingsHubScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { user, dataMode, sessionStartedAt, signOut } = useAuth();
  const { funds, reload: reloadFunds } = useFunds();
  const { data, reload: reloadDashboard } = useDashboard("all");
  const [refreshing, setRefreshing] = useState(false);
  const { uri: photoUri, onError: handlePhotoError } = useProfilePhotoUri(
    user?.id,
    user?.avatarUrl
  );

  const userEmail = user?.email ?? "Authenticated User";
  const userName =
    user?.name ||
    (userEmail.includes("@") ? userEmail.split("@")[0] : userEmail) ||
    "Portfolio Owner";

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([reloadFunds(), reloadDashboard()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Screen
      header={<SettingsHubHeader title="Settings" />}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {/* ---------- Profile hero ---------- */}
      <View
        style={{
          backgroundColor: isDark ? "#1E293B" : colors.primary,
          marginHorizontal: -spacing.lg,
          marginTop: -spacing.xs,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
          overflow: "hidden",
        }}
      >
        {/* decorative color washes */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -46,
            right: -30,
            width: 130,
            height: 130,
            borderRadius: 65,
            backgroundColor: "#FFFFFF",
            opacity: 0.12,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: -60,
            right: 60,
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: colors.secondary,
            opacity: 0.28,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              borderWidth: 2,
              borderColor: "#FFFFFF88",
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF2E",
            }}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                onError={handlePhotoError}
                style={{ width: 42, height: 42, borderRadius: 21 }}
                accessibilityLabel={`${userName}'s profile photo`}
              />
            ) : (
              <Text
                style={{ fontSize: 18, fontWeight: "900", color: "#FFFFFF" }}
              >
                {initialOf(userName)}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text
              numberOfLines={1}
              variant="title"
              color="#FFFFFF"
            >
              {userName}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontSize: fontSize.sm,
                color: "#FFFFFF",
                opacity: 0.85,
              }}
            >
              {userEmail}
            </Text>
            {sessionStartedAt ? (
              <Text
                style={{ fontSize: fontSize.xs, color: "#FFFFFF", opacity: 0.75 }}
              >
                Signed in {formatRelativeDate(sessionStartedAt)}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => router.push("/(app)/settings/profile")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open profile settings"
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF2E",
            }}
          >
            <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
            marginTop: spacing.md,
          }}
        >
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: "#FFFFFF2E",
            }}
          >
            <Text
              style={{ fontSize: 11, fontWeight: "800", color: "#FFFFFF" }}
              numberOfLines={1}
            >
              {dataMode === "cloud" ? "Supabase Cloud" : "On device"}
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: "#FFFFFF2E",
            }}
          >
            <Text
              style={{ fontSize: 11, fontWeight: "800", color: "#FFFFFF" }}
              numberOfLines={1}
            >
              {funds.length} {funds.length === 1 ? "fund" : "funds"}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(app)/tax-breakdown")}
            accessibilityRole="button"
            accessibilityLabel="Open Tax and Settlement ledger"
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: "#FFFFFF",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: isDark ? "#1E293B" : colors.primary,
              }}
              numberOfLines={1}
            >
              Tax Ledger →
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ---------- Account ---------- */}
      <SettingsGroup title="Settings">
        <SettingsRow
          tint={colors.emerald}
          icon={<User size={ROW_ICON_SIZE} color={colors.emerald} strokeWidth={ROW_ICON_STROKE} />}
          label="Profile"
          subtitle="Your details, photo, and account actions"
          onPress={() => router.push("/(app)/settings/profile")}
        />
        <SettingsRow
          tint={colors.purple}
          icon={<Building2 size={ROW_ICON_SIZE} color={colors.purple} strokeWidth={ROW_ICON_STROKE} />}
          label="My Funds"
          subtitle="Add, edit, or remove tracked funds"
          onPress={() => router.push("/(app)/settings/funds")}
        />
        <SettingsRow
          tint={colors.amber}
          icon={<Lock size={ROW_ICON_SIZE} color={colors.amber} strokeWidth={ROW_ICON_STROKE} />}
          label="Password"
          subtitle="Password reset and biometric unlock"
          last
          onPress={() => router.push("/(app)/settings/security")}
        />
      </SettingsGroup>

      {/* ---------- Data / cloud ---------- */}
      <GoCloudCard />

      {/* ---------- Preferences ---------- */}
      <SettingsGroup title="Preferences">
        <SettingsRow
          tint={colors.primary}
          icon={<TrendingUp size={ROW_ICON_SIZE} color={colors.primary} strokeWidth={ROW_ICON_STROKE} />}
          label="Auto-update NAV prices"
          subtitle="What this is and on/off"
          onPress={() => router.push("/(app)/settings/nav-auto")}
        />
        <SettingsRow
          tint={colors.rose}
          icon={<Bell size={ROW_ICON_SIZE} color={colors.rose} strokeWidth={ROW_ICON_STROKE} />}
          label="Notifications"
          subtitle="Push reminders and email summaries"
          onPress={() => router.push("/(app)/settings/notifications")}
        />
        <SettingsRow
          tint={colors.info}
          icon={<Palette size={ROW_ICON_SIZE} color={colors.info} strokeWidth={ROW_ICON_STROKE} />}
          label="Appearance"
          subtitle="Light, dark, or follow your system"
          onPress={() => router.push("/(app)/settings/appearance")}
        />
        <SettingsRow
          tint={colors.success}
          icon={<Receipt size={ROW_ICON_SIZE} color={colors.success} strokeWidth={ROW_ICON_STROKE} />}
          label="Tax & Settlement"
          subtitle="Deposits, fees, CGT, and net payout"
          last
          onPress={() => router.push("/(app)/tax-breakdown")}
        />
      </SettingsGroup>

      {/* ---------- More ---------- */}
      <SettingsGroup title="More">
        <SettingsRow
          tint={colors.info}
          icon={<Receipt size={ROW_ICON_SIZE} color={colors.info} strokeWidth={ROW_ICON_STROKE} />}
          label="Diagnostics"
          subtitle="Recent on-device events for troubleshooting"
          onPress={() => router.push("/(app)/settings/diagnostics")}
        />
        <SettingsRow
          tint={colors.secondary}
          icon={<Star size={ROW_ICON_SIZE} color={colors.secondary} strokeWidth={ROW_ICON_STROKE} />}
          label="Rate & Review"
          subtitle="Support the app with a rating"
          onPress={() => router.push("/(app)/settings/about")}
        />
        <SettingsRow
          tint={colors.blue}
          icon={<CircleHelp size={ROW_ICON_SIZE} color={colors.blue} strokeWidth={ROW_ICON_STROKE} />}
          label="Help"
          subtitle="How your numbers are calculated"
          onPress={() => router.push("/(app)/settings/help")}
        />
        <SettingsRow
          tint={colors.info}
          icon={<Globe size={ROW_ICON_SIZE} color={colors.info} strokeWidth={ROW_ICON_STROKE} />}
          label="Website"
          subtitle="Visit us online"
          last
          onPress={() => {
            Linking.openURL(APP_WEBSITE_URL).catch(() => { });
          }}
        />
      </SettingsGroup>

      {/* ---------- Log out ---------- */}
      <Pressable onPress={() => signOut()} accessibilityRole="button">
        {({ pressed }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              paddingVertical: spacing.xl,
              marginTop: spacing.sm,
              opacity: pressed ? 0.55 : 1,
            }}
          >
            <LogOut size={18} color={colors.rose} strokeWidth={1.8} />
            <Text
              style={{
                fontSize: fontSize.md,
                fontWeight: "600",
                color: colors.rose,
              }}
            >
              Log out
            </Text>
          </View>
        )}
      </Pressable>
    </Screen>
  );
}
