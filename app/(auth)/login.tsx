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

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import type { DataMode } from "@/lib/data/store";
import { useTheme, spacing, fontSize } from "@/theme";
import { Text, Button, Input, Card, Separator } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import { AuthShell } from "@/components/layout/AuthShell";
import { DataModeToggle } from "@/components/auth/DataModeToggle";
import { GoogleButton } from "@/components/auth/GoogleButton";

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signIn, signInWithGoogle, cloudAvailable } = useAuth();
  const { toast } = useToast();

  const envDefault = process.env.EXPO_PUBLIC_DEFAULT_DATA_MODE as
  | DataMode
  | undefined;
const [mode, setMode] = useState<DataMode>(
  envDefault === "cloud" && cloudAvailable
    ? "cloud"
    : envDefault === "local"
      ? "local"
      : cloudAvailable
        ? "cloud"
        : "local"
);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <AuthShell>
      <Card padded>
        <Text variant="heading">Welcome back</Text>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ marginTop: 2, marginBottom: spacing.lg }}
        >
          Sign in to your account to continue
        </Text>

        <View style={{ gap: spacing.lg }}>
          <GoogleButton
            label="Continue with Google"
            onPress={handleGoogle}
            loading={googleLoading}
          />

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Separator style={{ flex: 1 }} />
            <Text variant="caption" color={colors.mutedForeground}>
              Or sign in with email
            </Text>
            <Separator style={{ flex: 1 }} />
          </View>

          <View style={{ gap: 6 }}>
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ fontWeight: "600" }}
            >
              Where should your data live?
            </Text>
            <DataModeToggle mode={mode} onChange={setMode} />
            <Text variant="caption" color={colors.mutedForeground}>
              {mode === "cloud"
                ? "Uses the same Supabase project and tables as the web app."
                : "Stored only on this phone. Everything works offline."}
            </Text>
          </View>

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

          <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
            <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
              Forgot password?
            </Text>
          </Pressable>

          <Button fullWidth size="lg" loading={loading} onPress={handleSubmit}>
            Sign In
          </Button>

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
  );
}
