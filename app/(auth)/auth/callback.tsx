// ============================================================
// SahakariSIP — Google handoff callback
// ============================================================
// Landing route for sahakarisip://auth/callback?token=<single-use
// handoff token>. Two delivery styles exist and both are handled:
//
//   • The web relay opens the scheme while the app process is alive:
//     this screen mounts → resolveGoogleHandoff() hands the token to the
//     waiting signInWithGoogle() → session exchange runs there.
//   • Cold start (app was swiped away, OS launches it with the URL):
//     no waiter exists; the AuthContext Linking listener exchanges the
//     token directly, and this screen just reflects the resulting state.
//
// It never errors — a token-less visit simply returns to login.
// ============================================================

import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth, resolveGoogleHandoff } from "@/lib/auth/AuthContext";
import { useTheme } from "@/theme";
import { Text } from "@/components/ui/primitives";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { status } = useAuth();
  const resolved = useRef(false);

  useEffect(() => {
    if (resolved.current) return;
    resolved.current = true;
    const match = typeof token === "string" ? token.match(/^([0-9a-f]{32})$/i) : null;
    // Resolve any in-flight sign-in (warm handoff). Without one this is a
    // no-op — the Linking cold-start path handles the exchange instead.
    resolveGoogleHandoff(match ? match[1] : null);
  }, [token]);

  // Outcomes once the exchange settled.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/(app)/dashboard");
    }
  }, [status, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <Text variant="caption" color={colors.mutedForeground}>
        Completing Google sign-in…
      </Text>
    </View>
  );
}
