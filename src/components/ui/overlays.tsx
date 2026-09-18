// ============================================================
// SahakariSIP — Overlays: Modal, Select, Toast
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Modal as RNModal,
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, fontSize, radius, spacing } from "../../theme";
import { Text } from "./primitives";

// ------------------------------------------------------------
// Dialog / Sheet
// ------------------------------------------------------------

export function Modal({
  visible,
  onClose,
  title,
  description,
  children,
  footer,
  position = "center",
  maxWidth = 520,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  position?: "center" | "bottom";
  maxWidth?: number;
}) {
  const { colors } = useTheme();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: position === "bottom" ? "flex-end" : "center",
          padding: position === "bottom" ? 0 : spacing.lg,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              backgroundColor: colors.card,
              borderRadius: radius.xxl,
              borderWidth: 1,
              borderColor: colors.border,
              width: "100%",
              maxWidth: position === "bottom" ? undefined : maxWidth,
              alignSelf: "center",
              maxHeight: "90%",
              overflow: "hidden",
            },
            position === "bottom"
              ? {
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  paddingBottom: spacing.xxl,
                }
              : null,
          ]}
        >
          {(title || description) && (
            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingTop: spacing.xl,
                paddingBottom: spacing.md,
              }}
            >
              {title ? <Text variant="subheading">{title}</Text> : null}
              {description ? (
                <Text
                  variant="caption"
                  color={colors.mutedForeground}
                  style={{ marginTop: 4 }}
                >
                  {description}
                </Text>
              ) : null}
            </View>
          )}

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingBottom: spacing.lg,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View
              style={{
                paddingHorizontal: spacing.xl,
                paddingBottom: spacing.xl,
                paddingTop: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                gap: spacing.sm,
              }}
            >
              {footer}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

// ------------------------------------------------------------
// Select (modal option picker — the RN stand-in for shadcn Select)
// ------------------------------------------------------------

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

export function Select<T extends string = string>({
  label,
  value,
  options,
  onValueChange,
  placeholder = "Select…",
  disabled,
  containerStyle,
  displayValue,
}: {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  displayValue?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);
  const shown = displayValue ?? selected?.label ?? placeholder;

  return (
    <View style={containerStyle}>
      {label ? (
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ fontWeight: "600", marginBottom: 6 }}
        >
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          minHeight: 44,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
          {shown}
        </Text>
        <Text color={colors.mutedForeground} style={{ fontSize: 12 }}>
          ▾
        </Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        position="bottom"
        title={label}
      >
        <View style={{ gap: spacing.xs }}>
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onValueChange(opt.value);
                  setOpen(false);
                }}
                style={{
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: active ? colors.muted : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    variant="body"
                    style={{ fontWeight: active ? "700" : "500" }}
                  >
                    {opt.label}
                  </Text>
                  {opt.hint ? (
                    <Text variant="caption" color={colors.mutedForeground}>
                      {opt.hint}
                    </Text>
                  ) : null}
                </View>
                {active ? (
                  <Text color={colors.success} style={{ fontWeight: "900" }}>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------

export interface ToastMessage {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

interface ToastContextValue {
  toast: (message: ToastMessage) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastEntry extends ToastMessage {
  id: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: ToastMessage) => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { ...message, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts }: { toasts: ToastEntry[] }) {
  const { colors } = useTheme();
  const anims = useRef(new Map<number, Animated.Value>()).current;

  useEffect(() => {
    for (const t of toasts) {
      if (!anims.has(t.id)) {
        const v = new Animated.Value(0);
        anims.set(t.id, v);
        Animated.spring(v, {
          toValue: 1,
          useNativeDriver: true,
          damping: 18,
          stiffness: 220,
        }).start();
      }
    }
  }, [toasts, anims]);

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: spacing.lg,
        right: spacing.lg,
        bottom: spacing.xxxl + 24,
        gap: spacing.sm,
      }}
    >
      {toasts.map((t) => {
        const v = anims.get(t.id) ?? new Animated.Value(1);
        const accent =
          t.variant === "destructive"
            ? colors.destructive
            : t.variant === "success"
              ? colors.success
              : colors.primary;

        return (
          <Animated.View
            key={t.id}
            style={{
              opacity: v,
              transform: [
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              borderLeftWidth: 4,
              borderLeftColor: accent,
              padding: spacing.lg,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Text variant="label" style={{ fontSize: fontSize.md }}>
              {t.title}
            </Text>
            {t.description ? (
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ marginTop: 2 }}
              >
                {t.description}
              </Text>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ------------------------------------------------------------
// DropdownMenu (anchored popover — opens just below its trigger,
// the RN stand-in for the web's shadcn Select popover / dropdown)
// ------------------------------------------------------------

export interface DropdownAnchor {
  /** Window coordinates from measureInWindow on the trigger. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function DropdownMenu({
  visible,
  onClose,
  anchor,
  children,
  width = 240,
  maxHeight = 400,
}: {
  visible: boolean;
  onClose: () => void;
  anchor: DropdownAnchor;
  children?: React.ReactNode;
  width?: number;
  maxHeight?: number;
}) {
  const { colors } = useTheme();

  // Prefer aligning the panel's right edge with the trigger's right edge
  // (dropdowns from header icons), but keep it on screen.
  const left = Math.max(
    spacing.sm,
    Math.min(
      anchor.x,
      Math.max(spacing.sm, anchor.x + anchor.width - width)
    )
  );

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap anywhere outside to close */}
      <Pressable onPress={onClose} style={{ flex: 1 }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: anchor.y + anchor.height + 6,
            left,
            width,
            maxHeight,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.lg,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
        >
          <ScrollView style={{ flexGrow: 0 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

// ------------------------------------------------------------
// DropdownSelect — Select-styled field whose options open as an
// anchored dropdown just below the field (instead of a bottom sheet)
// ------------------------------------------------------------

export function DropdownSelect<T extends string = string>({
  label,
  value,
  options,
  onValueChange,
  placeholder = "Select…",
  disabled,
  displayValue,
}: {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  displayValue?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
  const triggerRef = useRef<View>(null);

  const selected = options.find((o) => o.value === value);
  const shown = displayValue ?? selected?.label ?? placeholder;

  return (
    <View>
      {label ? (
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ fontWeight: "600", marginBottom: 6 }}
        >
          {label}
        </Text>
      ) : null}

      <Pressable
        ref={triggerRef}
        onPress={() => {
          if (disabled) return;
          triggerRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
            setOpen(true);
          });
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          minHeight: 44,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
          {shown}
        </Text>
        <Text color={colors.mutedForeground} style={{ fontSize: 12 }}>
          ▾
        </Text>
      </Pressable>

      {anchor ? (
        <DropdownMenu
          visible={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          width={280}
        >
          <View style={{ padding: spacing.xs }}>
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: active ? colors.muted : "transparent",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="body"
                      style={{ fontWeight: active ? "700" : "500" }}
                    >
                      {opt.label}
                    </Text>
                    {opt.hint ? (
                      <Text variant="caption" color={colors.mutedForeground}>
                        {opt.hint}
                      </Text>
                    ) : null}
                  </View>
                  {active ? (
                    <Text color={colors.success} style={{ fontWeight: "900" }}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </DropdownMenu>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------
// Confirm dialog helper
// ------------------------------------------------------------

export function ConfirmDialog({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  loading,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} onClose={onClose} title={title} description={description}>
      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            height: 44,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text variant="label">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={loading}
          style={{
            flex: 1,
            height: 44,
            borderRadius: radius.lg,
            backgroundColor: destructive ? colors.destructive : colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text
            variant="label"
            color={destructive ? colors.destructiveForeground : colors.primaryForeground}
          >
            {loading ? "Working…" : confirmLabel}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
