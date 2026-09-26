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
import { RecoveryKeyOnce } from "@/components/auth/RecoveryKeyOnce";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    signIn,
    signInWithGoogle,
    resetLocalPassword,
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
  // One-time recovery key (legacy profile upgraded to a vault on login).
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  // Local forgot-password flow (device mode only — recovery key based).
  const [forgotOpen, setForgotOpen] = useState(false);
  const [frEmail, setFrEmail] = useState("");
  const [frKey, setFrKey] = useState("");
  const [frNew, setFrNew] = useState("");
  const [frConfirm, setFrConfirm] = useState("");
  const [frLoading, setFrLoading] = useState(false);
  const [frError, setFrError] = useState<string | null>(null);

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
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn(email, password, mode);
    } catch (e) {
      result = {
        success: false,
        error: e instanceof Error ? e.message : "Sign in failed unexpectedly.",
      };
    } finally {
      setLoading(false);
    }

    if (!result.success) {
      setError(result.error ?? "Sign in failed. Please try again.");
      return;
    }

    if (result.recoveryKey) {
      // Legacy profile upgraded to an encrypted vault — show the key once.
      setRecoveryKey(result.recoveryKey);
      return;
    }

    toast({
      title: "Welcome back",
      description: "Signed in successfully.",
      variant: "success",
    });
    router.replace("/(app)/dashboard");
  }

  async function handleForgotSubmit() {
    setFrError(null);
    setFrLoading(true);
    let result: Awaited<ReturnType<typeof resetLocalPassword>>;
    try {
      result = await resetLocalPassword(frEmail, frKey, frNew, frConfirm);
    } catch (e) {
      result = {
        success: false,
        error: e instanceof Error ? e.message : "Password reset failed.",
      };
    } finally {
      setFrLoading(false);
    }
    if (!result.success) {
      setFrError(result.error ?? "Password reset failed.");
      return;
    }
    toast({
      title: "Password reset",
      description: "Your password has been changed and you are signed in.",
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

  if (recoveryKey) {
    return (
      <AuthShell compact>
        <RecoveryKeyOnce
          recoveryKey={recoveryKey}
          onDone={() => {
            setRecoveryKey(null);
            router.replace("/(app)/dashboard");
          }}
        />
      </AuthShell>
    );
  }

  if (forgotOpen) {
    return (
      <AuthShell compact>
        <Card padded style={{ borderWidth: 0 }}>
          <Text variant="heading">Reset your password</Text>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ marginTop: 2, marginBottom: spacing.md }}
          >
            Enter the recovery key you saved when creating this on-device
            account. Nothing is sent anywhere - the reset happens on this
            phone.
          </Text>

          <View style={{ gap: spacing.md }}>
            <Input
              label="Email"
              value={frEmail}
              onChangeText={setFrEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={frError}
            />
            <Input
              label="Recovery key"
              value={frKey}
              onChangeText={setFrKey}
              placeholder="XXXX-XXXX-XXXX-XXXX-…"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Input
              label="New password"
              value={frNew}
              onChangeText={setFrNew}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
            />
            <Input
              label="Confirm new password"
              value={frConfirm}
              onChangeText={setFrConfirm}
              placeholder="Repeat the new password"
              secureTextEntry
              autoCapitalize="none"
            />

            <Button size="lg" loading={frLoading} onPress={handleForgotSubmit}>
              Reset password &amp; sign in
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setForgotOpen(false);
                setFrError(null);
              }}
            >
              Back to sign in
            </Button>
          </View>
        </Card>
      </AuthShell>
    );
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
            <Pressable onPress={() => mode === "local" && setForgotOpen(true)}>
              <Text
                variant="caption"
                color={mode === "local" ? colors.primary : colors.mutedForeground}
                style={{ fontWeight: "700" }}
              >
                Forgot password?
              </Text>
            </Pressable>
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
