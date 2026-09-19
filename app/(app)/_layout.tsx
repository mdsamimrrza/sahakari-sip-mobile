// ============================================================
// SahakariSIP — Authenticated app shell
// ============================================================
// Mirrors the web app's (app)/layout.tsx + AppShell:
//   • desktop sidebar  → mobile bottom tab bar
//   • auth guard       → redirect to /login when signed out
// The Tax & Settlement ledger is a stack route (as it is on the web
// app's mobile layout, where it's reached from the dashboard rather
// than from the 4-item bottom bar).
// ============================================================

import React, { useEffect } from "react";
import { View } from "react-native";
import { Redirect, Tabs, useRouter, useSegments } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LayoutDashboard,
  History,
  TrendingUp,
  Settings,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, fontSize, radius } from "@/theme";
import { Text } from "@/components/ui/primitives";

export default function AppLayout() {
  const { status, store } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // Auth guard — the mobile equivalent of the web middleware.ts
  if (status === "loading") {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  if (status === "locked") {
    return <Redirect href="/(auth)/lock" />;
  }
  if (status === "unauthenticated" || !store) {
    return <Redirect href="/(auth)/login" />;
  }

  // Floating pill tab bar — a detached rounded pill above the system
  // nav bar instead of a full-width edge bar. Screen's bottom padding
  // already clears this height.
  // Nested settings detail pages (profile / funds / notifications / …)
  // and the tax ledger hide the pill so they read as full-screen
  // iOS-style sub-pages with their own back header.
  const bottomInset = Math.max(8, insets.bottom);
  const tabBarHeight = 62;
  const segKey = segments.join("/");
  const isDetailRoute =
    segKey.includes("tax-breakdown") ||
    (segments.includes("settings" as never) &&
      segments.length > 2);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: isDetailRoute
          ? { display: "none" }
          : {
              position: "absolute",
              left: 16,
              right: 16,
              bottom: bottomInset + 8,
              height: tabBarHeight,
              borderRadius: radius.md,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              paddingBottom: 6,
              paddingTop: 6,
            },
        tabBarLabel: ({ color, children }) => (
          <Text
            style={{ fontSize: fontSize.xs, fontWeight: "700" }}
            color={color}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, focused }) => (
            <LayoutDashboard size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, focused }) => (
            <History size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="projections"
        options={{
          title: "Projections",
          tabBarIcon: ({ color, focused }) => (
            <TrendingUp size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Settings size={focused ? 23 : 21} color={color} />
          ),
        }}
      />
      {/* Reached from the dashboard / settings rather than the tab bar */}
      <Tabs.Screen name="tax-breakdown" options={{ href: null }} />
    </Tabs>
  );
}
