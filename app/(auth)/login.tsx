// ============================================================
// SahakariSIP — Login screen
// ============================================================
// Port of the web app's (auth)/login page: email + password, password
// visibility toggle, "forgot password" link, and a link to sign up.
//
// The web app also offers Google OAuth through NextAuth. On mobile that
// requires a whitelisted redirect URL in the Supabase project, so the
// app exposes the two routes that work end-to-end today: a Supabase
// cloud account (same project/tables as the web app) or an on-device
// profile that works fully offline.
// ============================================================

import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff, Fingerprint } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { loadSavedDataMode, saveDataMode, type DataMode } from "@/lib/data/store";
import { useTheme, spacing, fontSize, radius } from "@/theme";
import { Text, Button, Input, Card, Separator } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import { AuthShell } from "@/components/layout/AuthShell";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { DataModeDetailsLink } from "@/components/auth/DataModeDetails";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    signIn,
    signInWithGoogle,
    cloudAvailable,
    biometricEnabled,
    biometricSupported,
    unlockWithBiometric,
  } = useAuth();
  const { toast } = useToast();

  // Cloud is the first-class path — always start there when Supabase is
  // configured. The env default only matters with no cloud configured.
  // The user's explicit choice (toggle) persists and wins over the default,
  // so navigating to signup/sign-in or restarting never flips it back.
  const [mode, setMode] = useState<DataMode>(cloudAvailable ? "cloud" : "local");

  useEffect(() => {
    loadSavedDataMode().then((saved) => {
      if (saved) setMode(saved);
    });
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fingerprint unlock from the login screen itself (banking-style) — only
  // offered when the user has actually armed biometric unlock before.
  const showBiometric = biometricEnabled && biometricSupported;

  async function handleBiometricLogin() {
    setBioLoading(true);
    const res = await unlockWithBiometric();
    setBioLoading(false);
    if (res.success) {
      toast({
        title: "Welcome back",
        description: "Unlocked with your fingerprint.",
        variant: "success",
      });
      router.replace("/(app)/dashboard");
    } else if (res.error && res.error !== "Not verified.") {
      toast({
        title: "Unlock failed",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  async function handleSubmit() {
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    const result = await signIn(email, password, mode);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Sign in failed. Please try again.");
      return;
    }

    toast({
      title: "Welcome back",
      description: "Signed in successfully.",
      variant: "success",
    });
    router.replace("/(app)/dashboard");
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const result = await signInWithGoogle(mode);
    setGoogleLoading(false);

    if (!result.success) {
      toast({
        title: "Authentication Failed",
        description:
          result.error ??
          "Google sign-in was cancelled or failed. Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Welcome back",
      description: "Signed in with Google.",
      variant: "success",
    });
    router.replace("/(app)/dashboard");
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Mode switch — shows the mode you can switch TO (Local while on
          cloud, Cloud while on the on-device form). */}
      <AuthModeSwitch
        mode={mode}
        onSwitch={(next) => {
          setError(null);
          setMode(next);
          void saveDataMode(next);
        }}
      />

      <AuthShell compact>
      <Card padded style={{ borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Text variant="heading">Welcome back</Text>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ marginTop: 2, marginBottom: spacing.md }}
        >
          {mode === "cloud"
            ? "Sign in to your account to continue"
            : "Sign in to the profile saved on this phone"}
        </Text>

        <DataModeDetailsLink />

        <View style={{ gap: spacing.md }}>
          {mode === "cloud" && (
            <GoogleButton
              label="Continue with Google"
              onPress={handleGoogle}
              loading={googleLoading}
            />
          )}

          {mode === "cloud" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Separator style={{ flex: 1 }} />
              <Text variant="caption" color={colors.mutedForeground}>
                Or sign in with email
              </Text>
              <Separator style={{ flex: 1 }} />
            </View>
          )}

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            error={error}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textContentType="password"
            rightSlot={
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={10}>
                {showPassword ? (
                  <EyeOff size={18} color={colors.mutedForeground} />
                ) : (
                  <Eye size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            }
          />

          {mode === "cloud" ? (
            <Pressable onPress={() => router.push("/(auth)/forgot-password?mode=cloud")}>
              <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
                Forgot password?
              </Text>
            </Pressable>
          ) : (
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ textAlign: "center", fontSize: fontSize.xs }}
            >
              Forgot your password? On-device profiles can&apos;t be recovered
              by email.
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              size="lg"
              loading={loading}
              onPress={handleSubmit}
              style={{ flex: 1 }}
            >
              Sign In
            </Button>
            {showBiometric && (
              <Pressable
                onPress={handleBiometricLogin}
                disabled={bioLoading}
                accessibilityRole="button"
                accessibilityLabel="Unlock with fingerprint"
                style={({ pressed }) => ({
                  height: 52,
                  width: 52,
                  borderRadius: radius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: bioLoading || pressed ? 0.55 : 1,
                })}
              >
                <Fingerprint size={26} color={colors.primary} />
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
            <Text variant="caption" color={colors.mutedForeground}>
              Don&apos;t have an account?
            </Text>
            <Pressable onPress={() => router.push("/(auth)/signup")}>
              <Text
                variant="caption"
                color={colors.primary}
                style={{ fontWeight: "800", fontSize: fontSize.sm }}
              >
                Sign up
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>
      </AuthShell>
    </View>
  );
}
