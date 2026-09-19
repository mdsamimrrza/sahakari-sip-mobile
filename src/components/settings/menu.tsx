// ============================================================
// SahakariSIP — Shared settings menu UI
// ============================================================
// iOS-style grouped list matching the reference mock:
//   • SettingsGroup  — borderless white card, title + hairline + rows
//   • SettingsRow    — 22px outline icon + 15px label + light chevron
//   • SettingsHubHeader — centered "Settings", no icons (hub only)
//   • SettingsDetailHeader — `< Title` centered (every sub-page)
// Theme-aware light/dark — no hardcoded grays.
// ============================================================

import React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Badge } from "@/components/ui/primitives";

export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.lg,
        shadowColor: "#000",
        shadowOpacity: 0.07,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: fontSize.md,
          color: colors.foreground,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function SettingsRow({
  icon,
  label,
  subtitle,
  badge,
  destructive,
  last,
  tint,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  badge?: string;
  destructive?: boolean;
  last?: boolean;
  /** Tile tint for the leading icon — keeps rows colorful yet theme-aware. */
  tint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const labelColor = destructive ? colors.destructive : colors.foreground;
  const tileColor = destructive ? colors.destructive : tint ?? colors.mutedForeground;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingVertical: 14,
            borderBottomWidth: last ? 0 : 1,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.55 : 1,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${tileColor}1F`,
            }}
          >
            {icon}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              color={labelColor}
              style={{ fontSize: fontSize.md, fontWeight: "500" }}
            >
              {label}
            </Text>
            {subtitle ? (
              <Text
                color={colors.mutedForeground}
                style={{ marginTop: 1, fontSize: fontSize.xs }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {badge ? (
            <Badge bg={`${colors.destructive}1A`} color={colors.destructive}>
              {badge}
            </Badge>
          ) : null}
          <ChevronRight
            size={18}
            color={colors.mutedForeground}
            strokeWidth={1.8}
            style={{ opacity: 0.6 }}
          />
        </View>
      )}
    </Pressable>
  );
}

/** Centered "Settings" bar for the hub — mirrors the mock (no icons). */
export function SettingsHubHeader({ title }: { title: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
      }}
    >
      <Text
        align="center"
        style={{ fontSize: fontSize.lg, fontWeight: "700" }}
      >
        {title}
      </Text>
    </View>
  );
}

export function SettingsDetailHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  /** Optional right-side action (e.g. an info button) — page-only. */
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();

  function handleBack() {
    // Deterministic parent navigation: always land on the parent
    // settings menu (profile → hub, push → notifications hub) instead
    // of leaking onto another tab. Falls back to plain back/replace.
    if (segments.length > 2) {
      const parent = `/${segments.slice(0, -1).join("/")}` as never;
      try {
        router.dismissTo(parent);
        return;
      } catch {
        // fall through to replace
      }
      router.replace(parent);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(app)/settings" as never);
  }
  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: insets.top + spacing.xs,
        paddingBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.sm,
          minHeight: 42,
        }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft
            size={22}
            color={colors.foreground}
            strokeWidth={2}
          />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center", marginRight: right ? 0 : 38 }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: "700" }}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              color={colors.mutedForeground}
              style={{ fontSize: fontSize.xs, marginTop: 1 }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? (
          <View
            style={{
              width: 38,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {right}
          </View>
        ) : null}
      </View>
    </View>
  );
}
