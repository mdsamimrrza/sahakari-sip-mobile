// ============================================================
// SahakariSIP — Signup screen
// ============================================================
// Mirrors the web app's (auth)/signup page, including the zod rules
// (min 8 chars, one uppercase, one digit, passwords must match).
// ============================================================

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import type { DataMode } from "@/lib/data/store";
import { signupSchema } from "@/lib/schemas/auth";
import { useTheme, spacing, fontSize } from "@/theme";
import { Text, Button, Input, Card, Separator } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import { AuthShell } from "@/components/layout/AuthShell";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { DataModeDetailsLink } from "@/components/auth/DataModeDetails";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function SignupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signUp, signInWithGoogle, cloudAvailable } = useAuth();
  const { toast } = useToast();

  // Cloud is the first-class path — always start there when Supabase is
  // configured. The env default only matters with no cloud configured.
  const [mode, setMode] = useState<DataMode>(cloudAvailable ? "cloud" : "local");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      title: "Account created! 🎉",
      description: "Signed in with Google. Let's set up your first fund.",
      variant: "success",
    });
    router.replace("/onboarding");
  }

  async function handleSubmit() {
    setError(null);

    const parsed = signupSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setLoading(true);
    const result = await signUp(email, password, confirmPassword, mode);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Sign up failed. Please try again.");
      return;
    }

    if (result.needsEmailConfirmation) {
      toast({
        title: "Check your inbox",
        description:
          "Your account was created. Confirm your email address, then sign in.",
      });
      router.replace("/(auth)/login");
      return;
    }

    toast({
      title: "Account created! 🎉",
      description:
        mode === "cloud"
          ? "You're signed in. Let's set up your first fund."
          : "On-device profile ready. Let's set up your first fund.",
      variant: "success",
    });
    router.replace("/onboarding");
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
        }}
      />

      <AuthShell compact>
      <Card padded style={{ borderWidth: 0, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
        <Text variant="heading">Create your account</Text>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ marginTop: 2, marginBottom: spacing.md }}
        >
          {mode === "cloud"
            ? "Start tracking your SIP portfolio in under a minute"
            : "Create an on-device profile. Your data never leaves this phone"}
        </Text>

        <DataModeDetailsLink />

        <View style={{ gap: spacing.md }}>
          {mode === "cloud" && (
            <GoogleButton
              label="Sign up with Google"
              onPress={handleGoogle}
              loading={googleLoading}
            />
          )}

          {mode === "cloud" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
              <Separator style={{ flex: 1 }} />
              <Text variant="caption" color={colors.mutedForeground}>
                Or sign up with email
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
            error={error}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
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

          <Input
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />

          <Text variant="caption" color={colors.mutedForeground}>
            8+ characters, one uppercase letter and one number.
          </Text>

          <Button fullWidth loading={loading} onPress={handleSubmit}>
            Create Account
          </Button>

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
            <Text variant="caption" color={colors.mutedForeground}>
              Already have an account?
            </Text>
            <Pressable onPress={() => router.replace("/(auth)/login")}>
              <Text
                variant="caption"
                color={colors.primary}
                style={{ fontWeight: "800", fontSize: fontSize.sm }}
              >
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>
      </AuthShell>
    </View>
  );
}
