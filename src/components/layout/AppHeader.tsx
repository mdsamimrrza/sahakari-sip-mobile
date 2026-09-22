// ============================================================
// SahakariSIP — App Header (sticky top bar)
// ============================================================
// Port of the web app's mobile Header (lg:hidden): logo on the left;
// NotificationBell + ThemeToggle + UserAvatarMenu on the right.
// Rendered above each tab screen via <Screen header={...} />.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Eye,
  EyeOff,
  Inbox,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react-native";
import { useTheme, fontSize, radius, spacing } from "../../theme";
import { Text, Badge, Separator } from "../ui/primitives";
import { DropdownMenu, type DropdownAnchor } from "../ui/overlays";
import { AppLogo } from "./AppLogo";
import { useAuth } from "../../lib/auth/AuthContext";
import { useProfilePhotoUri } from "../../lib/profilePhoto";
import { formatRelativeDate } from "../../lib/format";
import { usePrivacy } from "../../lib/privacy/PrivacyContext";
import type { NotificationItem } from "../../lib/types";

// ------------------------------------------------------------
// Round icon button shared by the header controls
// ------------------------------------------------------------

function HeaderIconButton({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------
// Theme toggle — Sun (amber) in dark mode, Moon (ink) in light
// ------------------------------------------------------------

export function ThemeToggle() {
  const { colors, isDark, toggle } = useTheme();
  return (
    <HeaderIconButton onPress={toggle} accessibilityLabel="Toggle theme">
      {isDark ? (
        <Sun size={20} color={colors.amber} />
      ) : (
        <Moon size={20} color={colors.foreground} />
      )}
    </HeaderIconButton>
  );
}

// ------------------------------------------------------------
// Privacy toggle — Eye / EyeOff toggle for amount privacy
// ------------------------------------------------------------

export function PrivacyToggle() {
  const { colors } = useTheme();
  const { isPrivate, togglePrivacy } = usePrivacy();

  return (
    <HeaderIconButton
      onPress={togglePrivacy}
      accessibilityLabel={isPrivate ? "Show amounts" : "Hide amounts"}
      style={{ width: 38, height: 38 }}
    >
      {isPrivate ? (
        <EyeOff size={20} color={colors.rose} />
      ) : (
        <Eye size={20} color={colors.foreground} />
      )}
    </HeaderIconButton>
  );
}

// ------------------------------------------------------------
// Notification bell — unread badge + dropdown list
// ------------------------------------------------------------

function NotificationBell() {
  const { colors } = useTheme();
  const router = useRouter();
  const { store } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    const res = await store.getNotifications();
    if (res.success && res.data) setItems(res.data);
  }, [store]);

  // Poll every 60s while mounted, like the web NotificationBell.
  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const unread = items.filter((n) => !n.is_read).length;

  const openDropdown = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
    load();
  };

  const markAll = async () => {
    if (!store) return;
    // Optimistic update, matching the web behaviour.
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await store.markAllNotificationsRead();
    load();
  };

  const pressItem = async (n: NotificationItem) => {
    if (!store) return;
    if (!n.is_read) {
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      await store.markNotificationRead(n.id);
    }
    setOpen(false);
    if (n.url) {
      // Navigation comes from a server-owned row, but stay defensive:
      // allowlist the first segment against the (app) route tree and
      // reject traversal so a crafted url can never leave (app)/*.
      const segments = n.url
        .replace(/^\/+/, "")
        .split(/[?#]/)[0]
        .split("/")
        .filter(Boolean);
      const allowedRoots = new Set([
        "dashboard",
        "history",
        "projections",
        "tax-breakdown",
        "settings",
      ]);
      const safe =
        segments.length > 0 &&
        allowedRoots.has(segments[0]) &&
        segments.every((s) => s !== "." && s !== "..");
      if (safe) {
        router.push(`/(app)/${segments.join("/")}` as never);
      }
    }
  };

  return (
    <>
      <View ref={triggerRef}>
        <HeaderIconButton
          onPress={openDropdown}
          accessibilityLabel="Notifications"
          style={{ marginRight: 2 }}
        >
          <Bell size={20} color={colors.foreground} />
          {unread > 0 ? (
            <View
              style={{
                position: "absolute",
                top: 3,
                right: 2,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 4,
                borderRadius: 8,
                backgroundColor: colors.rose,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 9, fontWeight: "900" }} color="#FFFFFF">
                {unread > 9 ? "9+" : unread}
              </Text>
            </View>
          ) : null}
        </HeaderIconButton>
      </View>

      {anchor ? (
        <DropdownMenu
          visible={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          width={330}
          maxHeight={460}
        >
          <View style={{ padding: spacing.md, gap: spacing.md }}>
          {/* Header row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing.sm,
            }}
          >
            <Text variant="subheading">Notifications</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              {unread > 0 ? (
                <Badge bg={`${colors.rose}1A`} color={colors.rose}>
                  {unread} new
                </Badge>
              ) : null}
              <HeaderIconButton onPress={markAll} accessibilityLabel="Mark all read">
                <CheckCheck size={18} color={colors.emerald} />
              </HeaderIconButton>
            </View>
          </View>

          {/* List (latest 4, like the web dropdown) */}
          {items.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: colors.muted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Inbox size={24} color={colors.mutedForeground} />
              </View>
              <Text variant="label">No notifications yet</Text>
              <Text variant="caption" color={colors.mutedForeground} align="center">
                Your monthly installment reminders will appear here.
              </Text>
            </View>
          ) : (
            items.slice(0, 4).map((n) => (
              <Pressable
                key={n.id}
                onPress={() => pressItem(n)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.muted : colors.card,
                  opacity: n.is_read ? 0.75 : 1,
                })}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    backgroundColor: n.is_read ? colors.muted : `${colors.amber}26`,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {n.is_read ? (
                    <Check size={16} color={colors.mutedForeground} />
                  ) : (
                    <Bell size={16} color={colors.amber} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {!n.is_read ? (
                      <View
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.rose }}
                      />
                    ) : null}
                    <Text
                      variant="caption"
                      style={{ fontWeight: n.is_read ? "600" : "800", flexShrink: 1 }}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.mutedForeground} numberOfLines={2}>
                    {n.body}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Clock size={11} color={colors.mutedForeground} />
                    <Text variant="micro" color={colors.mutedForeground}>
                      {formatRelativeDate(n.created_at)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))
          )}

          <Separator />

          <Pressable
            onPress={() => {
              setOpen(false);
              router.push("/(app)/settings");
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
              paddingVertical: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.muted,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <SettingsIcon size={16} color={colors.foreground} />
            <Text variant="label">Notification Settings</Text>
          </Pressable>
        </View>
        </DropdownMenu>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------
// User avatar menu — initial avatar, session badge, quick controls
// ------------------------------------------------------------

function UserAvatarMenu() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, sessionStartedAt, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);

  const email = user?.email ?? "Authenticated User";
  const displayName =
    user?.name ||
    (email.includes("@") ? email.split("@")[0] : email) ||
    "Portfolio Owner";
  const initial = (displayName.charAt(0) || "S").toUpperCase();
  const { uri: photoUri, onError: handlePhotoError } = useProfilePhotoUri(
    user?.id,
    user?.avatarUrl
  );

  // Captured when the menu opens, like the web's mount-time stamp.
  const sessionSince = sessionStartedAt
    ? formatRelativeDate(sessionStartedAt).replace(" ago", " ago")
    : null;

  return (
    <>
      <View ref={triggerRef}>
        <Pressable
          onPress={() => {
            triggerRef.current?.measureInWindow((x, y, width, height) => {
              setAnchor({ x, y, width, height });
              setOpen(true);
            });
          }}
          accessibilityLabel={`${displayName} (${email})`}
          accessibilityRole="button"
          style={({ pressed }) => ({
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: colors.emerald,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.75 : 1,
            overflow: "hidden",
          })}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              onError={handlePhotoError}
              style={{ width: 32, height: 32, borderRadius: 16 }}
              accessibilityLabel={`${displayName}'s profile photo`}
            />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "900" }} color={colors.emerald}>
              {initial}
            </Text>
          )}
        </Pressable>
      </View>

      {anchor ? (
        <DropdownMenu
          visible={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          width={310}
        >
          <View style={{ padding: spacing.md, gap: spacing.sm }}>
          {/* User details */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.emerald,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  onError={handlePhotoError}
                  style={{ width: 42, height: 42, borderRadius: 21 }}
                />
              ) : (
                <Text style={{ fontSize: 18, fontWeight: "900" }} color={colors.emerald}>
                  {initial}
                </Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" numberOfLines={1}>
                {displayName}
              </Text>
              <Text variant="caption" color={colors.mutedForeground} numberOfLines={1}>
                {email}
              </Text>
            </View>
          </View>

          {/* Session badge */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.lg,
              backgroundColor: colors.muted,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock size={14} color={colors.emerald} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="micro" color={colors.mutedForeground}>
                Session Active
              </Text>
              <Text variant="caption" style={{ fontWeight: "700" }} numberOfLines={1}>
                {sessionSince ?? "—"}
              </Text>
            </View>
          </View>

          <Separator style={{ marginVertical: 2 }} />

          <Pressable
            onPress={() => {
              setOpen(false);
              router.push("/(app)/settings");
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.lg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <SettingsIcon size={16} color={colors.foreground} />
            <Text variant="label">Account Settings</Text>
          </Pressable>

          <Separator style={{ marginVertical: 2 }} />

          <Pressable
            onPress={async () => {
              setOpen(false);
              await signOut();
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.lg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <LogOut size={16} color={colors.rose} />
            <Text variant="label" color={colors.rose}>
              Log Out
            </Text>
          </Pressable>
        </View>
        </DropdownMenu>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------
// The sticky header bar itself
// ------------------------------------------------------------

export function AppHeader({ title }: { title?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: colors.background,
        paddingTop: insets.top,
        borderBottomWidth: 2,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
        }}
      >
        {title ? (
          <Text style={{ fontSize: fontSize.lg, fontWeight: "800" }} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <AppLogo size={24} />
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
          <NotificationBell />
          <ThemeToggle />
          <UserAvatarMenu />
        </View>
      </View>
    </View>
  );
}
