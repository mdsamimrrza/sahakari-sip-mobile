// ============================================================
// SahakariSIP — Core UI Primitives
// ============================================================
// A small, dependency-light component set in the "Editorial Ledger"
// language: hairline rules, sharp corners, serif display type, uppercase
// micro-labels, tabular numerals, and no shadows.
// ============================================================

import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme, fontFamily, fontSize, radius, spacing } from "../../theme";

// ------------------------------------------------------------
// Text
// ------------------------------------------------------------

type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "label"
  | "caption"
  | "micro"
  | "mono";

interface TextProps {
  children?: React.ReactNode;
  variant?: TextVariant;
  color?: TextStyle["color"];
  weight?: TextStyle["fontWeight"];
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  tabular?: boolean;
}

export function Text({
  children,
  variant = "body",
  color,
  weight,
  align,
  numberOfLines,
  style,
  tabular,
}: TextProps) {
  const { colors } = useTheme();

  const variantStyle: TextStyle = (() => {
    switch (variant) {
      case "display":
        return { fontSize: fontSize.display, fontFamily: fontFamily.display, fontWeight: "700", letterSpacing: -0.5 };
      case "title":
        return { fontSize: fontSize.xxl, fontFamily: fontFamily.display, fontWeight: "700", letterSpacing: -0.3 };
      case "heading":
        return { fontSize: fontSize.xl, fontFamily: fontFamily.display, fontWeight: "700", letterSpacing: -0.2 };
      case "subheading":
        return { fontSize: fontSize.lg, fontWeight: "700" };
      case "label":
        return { fontSize: fontSize.base, fontWeight: "600" };
      case "caption":
        return { fontSize: fontSize.sm, fontWeight: "500" };
      case "micro":
        return {
          fontSize: fontSize.xs,
          fontWeight: "600",
          letterSpacing: 0.2,
        };
      case "mono":
        return {
          fontSize: fontSize.md,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        };
      case "body":
      default:
        return { fontSize: fontSize.md, fontWeight: "400" };
    }
  })();

  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: fontFamily.body },
        variantStyle,
        { color: color ?? colors.foreground },
        align ? { textAlign: align } : null,
        tabular ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

// ------------------------------------------------------------
// Card
// ------------------------------------------------------------

// ------------------------------------------------------------
// Card
// ------------------------------------------------------------

export function Card({
  children,
  style,
  padded = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xl,
          padding: padded ? spacing.xl : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function CardHeader({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.md }, style]}>
      {children}
    </View>
  );
}

export function CardTitle({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text variant="heading" style={style}>
      {children}
    </Text>
  );
}

export function CardDescription({ children }: { children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: 4, lineHeight: 18 }}>
      {children}
    </Text>
  );
}

export function CardContent({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }, style]}>
      {children}
    </View>
  );
}

// ------------------------------------------------------------
// Button
// ------------------------------------------------------------

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export function Button({
  children,
  onPress,
  variant = "default",
  size = "md",
  disabled,
  loading,
  style,
  textColor,
  fullWidth,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  fullWidth?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const isDisabled = disabled || loading;

  const bg: string = (() => {
    switch (variant) {
      case "secondary":
        return colors.secondary;
      case "outline":
      case "ghost":
        return "transparent";
      case "destructive":
        return colors.destructive;
      default:
        return colors.primary;
    }
  })();

  const fg: string = (() => {
    switch (variant) {
      case "secondary":
        return colors.secondaryForeground;
      case "outline":
      case "ghost":
        return colors.foreground;
      case "destructive":
        return colors.destructiveForeground;
      default:
        return colors.primaryForeground;
    }
  })();

  const dims: ViewStyle = (() => {
    switch (size) {
      case "sm":
        return { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.md };
      case "lg":
        return { height: 52, paddingHorizontal: spacing.xxl, borderRadius: radius.lg };
      case "icon":
        return { height: 42, width: 42, paddingHorizontal: 0, borderRadius: radius.md };
      default:
        return { height: 46, paddingHorizontal: spacing.xl, borderRadius: radius.lg };
    }
  })();

  const hasShadow = variant === "default" || variant === "secondary";

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: bg,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor: variant === "outline" ? colors.border : "transparent",
          shadowColor: "transparent",
          shadowOffset: { width: 0, height: pressed ? 2 : 4 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: isDisabled ? 0.5 : 1,
        },
        dims,
        fullWidth ? { width: "100%" } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      {typeof children === "string" ? (
        <Text
          variant="label"
          color={textColor ?? fg}
          style={{ fontSize: size === "sm" ? fontSize.base : fontSize.md, fontWeight: "700" }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------
// Input / Label
// ------------------------------------------------------------

export function Label({
  children,
  htmlFor,
  style,
}: {
  children?: React.ReactNode;
  htmlFor?: string;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text
      variant="caption"
      color={colors.mutedForeground}
      style={[{ fontWeight: "600", marginBottom: 6 }, style]}
    >
      {children}
    </Text>
  );
}

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  rightSlot?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Input({
  label,
  error,
  rightSlot,
  containerStyle,
  style,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  return (
    <View style={containerStyle}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.input,
          borderWidth: 1.5,
          borderColor: error ? colors.destructive : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          minHeight: 48,
        }}
      >
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          style={[
            {
              flex: 1,
              color: colors.foreground,
              fontSize: fontSize.md,
              paddingVertical: 10,
            },
            style,
          ]}
          {...rest}
        />
        {rightSlot}
      </View>
      {error ? (
        <Text variant="caption" color={colors.destructive} style={{ marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------
// Badge
// ------------------------------------------------------------

export function Badge({
  children,
  color,
  bg,
  style,
}: {
  children?: React.ReactNode;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: spacing.sm + 4,
          paddingVertical: 4,
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: color ? `${color}40` : `${colors.primary}40`,
          backgroundColor: bg ?? (color ? `${color}15` : `${colors.primary}15`),
        },
        style,
      ]}
    >
      {/* Strings, numbers, and mixed content (e.g. {x}% fee) must all be
          rendered inside a <Text>; only JSX elements pass through raw. */}
      {typeof children === "string" ||
      typeof children === "number" ||
      Array.isArray(children) ? (
        <Text
          style={{ fontSize: fontSize.xs, fontWeight: "700" }}
          color={color ?? colors.primary}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

// ------------------------------------------------------------
// Separator
// ------------------------------------------------------------

export function Separator({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[{ height: 1, backgroundColor: colors.border, width: "100%" }, style]}
    />
  );
}

// ------------------------------------------------------------
// Skeleton
// ------------------------------------------------------------

export function Skeleton({
  width = "100%",
  height = 16,
  style,
}: {
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { width, height, borderRadius: radius.md, backgroundColor: colors.skeleton },
        style,
      ]}
    />
  );
}

// ------------------------------------------------------------
// Switch (row toggle)
// ------------------------------------------------------------

export function Switch({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      style={{
        width: 48,
        height: 28,
        borderRadius: radius.md,
        padding: 3,
        justifyContent: "center",
        backgroundColor: value ? colors.success : colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: radius.md,
          backgroundColor: colors.card,
          alignSelf: value ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );
}

// ------------------------------------------------------------
// Checkbox
// ------------------------------------------------------------

export function Checkbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onToggle(!checked)}
      style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Text style={{ fontSize: 12, fontWeight: "900" }} color={colors.primaryForeground}>
            ✓
          </Text>
        ) : null}
      </View>
      {label ? (
        <Text variant="caption" color={colors.foreground} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ------------------------------------------------------------
// Progress bar
// ------------------------------------------------------------

export function ProgressBar({
  value,
  color,
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View
      style={{
        height,
        borderRadius: radius.md,
        backgroundColor: colors.muted,
        overflow: "hidden",
        width: "100%",
      }}
    >
      <View
        style={{
          width: `${pct}%`,
          height: "100%",
          backgroundColor: color ?? colors.primary,
          borderRadius: radius.md,
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------
// Avatar (initial circle — mirrors the web UserAvatarMenu)
// ------------------------------------------------------------

export function Avatar({
  initial,
  size = 40,
  bg,
  color,
}: {
  initial: string;
  size?: number;
  bg?: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        backgroundColor: bg ?? colors.muted,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{ fontSize: size * 0.42, fontWeight: "900" }}
        color={color ?? colors.foreground}
      >
        {initial}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------
// Empty state
// ------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.sm }}>
      <Text variant="label" color={colors.foreground} align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="caption" color={colors.mutedForeground} align="center">
          {description}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: { flexDirection: "row", alignItems: "center" },
  gapSm: { gap: spacing.sm },
  gapMd: { gap: spacing.md },
});
