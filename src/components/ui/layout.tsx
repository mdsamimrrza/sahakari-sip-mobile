// ============================================================
// SahakariSIP — Layout helpers
// ============================================================

import React from "react";
import {
  RefreshControl,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, radius, spacing, fontSize } from "../../theme";
import { Text } from "./primitives";

/** Scrollable page body with consistent padding + optional pull-to-refresh. */
export function Screen({
  children,
  header,
  refreshing,
  onRefresh,
  contentStyle,
  padded = true,
}: {
  children?: React.ReactNode;
  /** Sticky top bar rendered above the scroll area (handles its own safe area). */
  header?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[
          {
            // Edge-to-edge Android draws behind the status bar; without this
            // inset the page header sits beneath the clock/battery and taps
            // land on the system bar instead of the UI. Screens that render
            // a sticky header keep the inset inside that header instead.
            paddingTop: header ? spacing.xs : insets.top + spacing.md,
            paddingHorizontal: padded ? spacing.lg : 0,
            paddingBottom: insets.bottom + spacing.xxxl + 40,
            gap: spacing.lg,
          },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Page title block — matches the web app's `h1 + muted subtitle` header. */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: spacing.md,
        marginTop: spacing.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Section title inside a card or page. */
export function SectionHeader({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="subheading" style={{ fontSize: fontSize.lg }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.mutedForeground}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A labelled metric row used across the tax ledger and summary panels. */
export function MetricRow({
  label,
  value,
  valueColor,
  emphasis,
  bordered,
}: {
  label: string;
  value: string;
  valueColor?: string;
  emphasis?: boolean;
  bordered?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.sm,
        gap: spacing.md,
        borderTopWidth: bordered ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <Text
        variant={emphasis ? "label" : "caption"}
        color={emphasis ? colors.foreground : colors.mutedForeground}
        style={{ flex: 1 }}
      >
        {label}
      </Text>
      <Text
        variant={emphasis ? "label" : "mono"}
        color={valueColor ?? colors.foreground}
        style={{ fontWeight: emphasis ? "800" : "600" }}
        tabular
      >
        {value}
      </Text>
    </View>
  );
}

/** Lightweight data table used for the tax ledger / projections. */
export function DataTable({
  columns,
  rows,
  onPressRow,
}: {
  columns: Array<{ key: string; label: string; align?: "left" | "right"; width?: number }>;
  rows: Array<{
    key: string;
    cells: Record<string, { text: string; color?: string; bold?: boolean }>;
  }>;
  onPressRow?: (key: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: radius.xl,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: colors.muted,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        {columns.map((c) => (
          <View
            key={c.key}
            style={{
              flex: c.width ?? 1,
              alignItems: c.align === "right" ? "flex-end" : "flex-start",
            }}
          >
            <Text variant="micro" color={colors.mutedForeground} numberOfLines={1}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Body */}
      {rows.map((r, idx) => (
        <View
          key={r.key}
          style={{
            flexDirection: "row",
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.md,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          {columns.map((c) => {
            const cell = r.cells[c.key];
            return (
              <View
                key={c.key}
                style={{
                  flex: c.width ?? 1,
                  alignItems: c.align === "right" ? "flex-end" : "flex-start",
                }}
              >
                <Text
                  variant="caption"
                  color={cell?.color ?? colors.foreground}
                  numberOfLines={2}
                  tabular={c.align === "right"}
                  style={{ fontWeight: cell?.bold ? "800" : "500" }}
                >
                  {cell?.text ?? "—"}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
