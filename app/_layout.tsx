// ============================================================
// SahakariSIP — Root Layout
// ============================================================
// Provider stack mirrors the web app's src/app/layout.tsx
// (ThemeProvider → SessionProvider) plus a toast host.
// ============================================================

import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import { ThemeProvider, useTheme } from "@/theme";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { ToastProvider } from "@/components/ui/overlays";
import { MergePromptDialog } from "@/components/auth/MergePromptDialog";
import { BiometricPromptDialog } from "@/components/auth/BiometricPromptDialog";
import { AnimatedSplash } from "@/components/layout/AnimatedSplash";

import { PrivacyProvider } from "@/lib/privacy/PrivacyContext";
import * as ScreenCapture from "expo-screen-capture";


SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedApp() {
  const { colors, isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded] = useFonts({
    "InstrumentSerif-Regular": require("../assets/fonts/InstrumentSerif-Regular.ttf"),
    HankenGrotesk: require("../assets/fonts/HankenGrotesk.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Block screenshots, screen recording and screen sharing (Android FLAG_SECURE + iOS)
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync().catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

if (!fontsLoaded) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryForeground, justifyContent: "center", alignItems: "center" }}>
              <View style={{ width: 6, height: 6, backgroundColor: colors.primary, borderRadius: 3 }} />
            </View>
          </View>
        </View>
      );
    }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
        <Stack.Screen name="(auth)" options={{ animation: "fade" }} />
        <Stack.Screen name="(app)" options={{ animation: "fade" }} />
      </Stack>
      {/* One-time local→cloud merge offer (Settings → Go Cloud flow) */}
      <MergePromptDialog />
      {/* Post-login "enable fingerprint unlock?" offer */}
      <BiometricPromptDialog />
      {/* Animated splash — plays on cold start, fades into the app */}
      {!splashDone && <AnimatedSplash onDone={() => setSplashDone(true)} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <PrivacyProvider>
            <ToastProvider>
              <ThemedApp />
            </ToastProvider>
          </PrivacyProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
