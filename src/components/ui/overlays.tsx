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
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, fontSize, radius, spacing } from "../../theme";
import { Button, Text } from "./primitives";

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
              borderRadius: radius.xl,
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

export function Select<T extends string = string>(props: {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  displayValue?: string;
}) {
  return <DropdownSelect {...props} />;
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
  const insets = useSafeAreaInsets();
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
        top: insets.top + spacing.md,
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
                    outputRange: [-24, 0],
                  }),
                },
              ],
              backgroundColor: colors.card,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.border,
              borderLeftWidth: 6,
              borderLeftColor: accent,
              padding: spacing.lg,
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
  const screenWidth = useWindowDimensions().width;

  const actualWidth = Math.min(width, screenWidth - spacing.md * 2);

  // Position cleanly: align right edge with anchor right edge if possible,
  // but clamp so it never overflows left or right screen bounds!
  const left = Math.max(
    spacing.md,
    Math.min(
      anchor.x + anchor.width - actualWidth,
      screenWidth - actualWidth - spacing.md
    )
  );

  const statusOffset =
    Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0;
  const computedTop = anchor.y + anchor.height + 6 + statusOffset;

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
            top: computedTop,
            left,
            width: actualWidth,
            maxHeight,
            backgroundColor: colors.card,
            borderWidth: 1.5,
            borderColor: colors.border,
            borderRadius: radius.xl,
            overflow: "hidden",
            shadowColor: "transparent",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0,
            shadowRadius: 0,
            elevation: 0,
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
  containerStyle,
}: {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onValueChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  displayValue?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
  const triggerRef = useRef<View>(null);

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
          borderWidth: 1.5,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          minHeight: 48,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text variant="body" numberOfLines={1} style={{ flex: 1, fontWeight: "600" }}>
          {shown}
        </Text>
        <ChevronDown size={18} color={colors.mutedForeground} />
      </Pressable>

      {anchor ? (
        <DropdownMenu
          visible={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          width={anchor.width || 280}
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
        <Button variant="outline" onPress={onClose} style={{ flex: 1 }}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          onPress={onConfirm}
          loading={loading}
          style={{ flex: 1 }}
        >
          {confirmLabel}
        </Button>
      </View>
    </Modal>
  );
}
