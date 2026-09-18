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
import { Redirect, Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  LayoutDashboard,
  History,
  TrendingUp,
  Settings,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, fontSize } from "@/theme";
import { Text } from "@/components/ui/primitives";

export default function AppLayout() {
  const { status, store } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Auth guard — the mobile equivalent of the web middleware.ts
  if (status === "loading") {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  if (status === "unauthenticated" || !store) {
    return <Redirect href="/(auth)/login" />;
  }

  // With edge-to-edge the fixed paddings would place the tab strip behind the
  // Android system navigation bar, so scale them with the real bottom inset.
  const bottomInset = Math.max(8, insets.bottom);
  const tabBarHeight = 62 + Math.max(0, insets.bottom - 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomInset,
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
