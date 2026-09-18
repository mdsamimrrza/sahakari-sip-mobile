// ============================================================
// SahakariSIP — Forgot password (3-step OTP flow)
// ============================================================
// Port of the web app's forgot-password page: step pills (Email →
// Verify → Reset), 6 single-digit code boxes with auto-advance,
// backspace/arrow navigation and paste support.
//
// Cloud accounts verify through Supabase Auth (`verifyOtp` with a
// recovery code — the Supabase project's "Reset Password" email
// template must include {{ .Token }} for the 6-digit code to arrive).
// On-device profiles have no email channel, so the screen says so
// plainly instead of pretending an email was sent.
// ============================================================

import React, { useRef, useState } from "react";
import {
  Pressable,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { CheckCircle, KeyRound, Lock, Mail } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import type { DataMode } from "@/lib/data/store";
import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Button, Input, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import { AuthShell } from "@/components/layout/AuthShell";
import { DataModeToggle } from "@/components/auth/DataModeToggle";

type Step = 0 | 1 | 2 | 3; // 3 = done

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    requestPasswordReset,
    verifyPasswordResetOtp,
    completePasswordReset,
    cloudAvailable,
  } = useAuth();
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
  const [step, setStep] = useState<Step>(0);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRefs = useRef<Array<TextInput | null>>([]);

  const setDigit = (index: number, value: string) => {
    // Paste support on any box: distribute the digits.
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = [...code];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        next[index + i] = digits[i];
      }
      setCode(next);
      const focusAt = Math.min(5, index + digits.length);
      codeRefs.current[focusAt]?.focus();
      return;
    }
    const next = [...code];
    next[index] = digits;
    setCode(next);
    if (digits && index < 5) codeRefs.current[index + 1]?.focus();
  };

  const onCodeKeyPress = (index: number, key: string) => {
    if (key !== "Backspace") return;
    if (code[index]) {
      const next = [...code];
      next[index] = "";
      setCode(next);
      return;
    }
    if (index > 0) {
      codeRefs.current[index - 1]?.focus();
      const next = [...code];
      next[index - 1] = "";
      setCode(next);
    }
  };

  const codeBoxStyle: TextStyle = {
    width: 46,
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    textAlign: "center",
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
  };

  // ---------- Step actions ----------

  async function handleSendCode() {
    setError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(email, mode);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Could not start the reset flow.");
      return;
    }

    toast({
      title: "Reset code sent",
      description: "Check your inbox for the 6-digit code.",
      variant: "success",
    });
    setCode(["", "", "", "", "", ""]);
    setStep(1);
  }

  async function handleVerify() {
    setError(null);
    if (code.some((c) => !c)) {
      toast({ title: "Enter all 6 digits" });
      return;
    }

    setLoading(true);
    const result = await verifyPasswordResetOtp(email, code.join(""), mode);
    setLoading(false);

    if (!result.success) {
      toast({
        title: "Invalid code",
        description: result.error,
        variant: "destructive",
      });
      // Clear the boxes and refocus, like the web flow.
      setCode(["", "", "", "", "", ""]);
      codeRefs.current[0]?.focus();
      return;
    }

    setStep(2);
  }

  async function handleReset() {
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await completePasswordReset(newPassword, mode);
    setLoading(false);

    if (!result.success) {
      setError(result.error ?? "Could not reset the password.");
      return;
    }

    setStep(3);
  }

  // ---------- Step indicator ----------

  const stepDefs = [
    { label: "Email", icon: Mail },
    { label: "Verify", icon: KeyRound },
    { label: "Reset", icon: Lock },
  ];

  function StepPills() {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.xs,
          marginBottom: spacing.xl,
        }}
      >
        {stepDefs.map((s, i) => {
          const done = step > i;
          const active = step === i;
          const reached = done || active;
          const Icon = done ? CheckCircle : s.icon;
          return (
            <React.Fragment key={s.label}>
              <View
                style={{
                  alignItems: "center",
                  gap: 4,
                  width: 64,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: done
                      ? colors.primary
                      : active
                        ? colors.card
                        : colors.muted,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.primary : colors.border,
                  }}
                >
                  <Icon
                    size={16}
                    color={done ? colors.primaryForeground : active ? colors.primary : colors.mutedForeground}
                  />
                </View>
                <Text
                  variant="micro"
                  color={reached ? colors.foreground : colors.mutedForeground}
                  style={{ fontSize: 10, letterSpacing: 0.4 }}
                >
                  {s.label}
                </Text>
              </View>
              {i < stepDefs.length - 1 ? (
                <View
                  style={{
                    width: 18,
                    height: 2,
                    backgroundColor: step > i ? colors.primary : colors.border,
                    borderRadius: 1,
                    marginBottom: 18,
                  }}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
    );
  }

  // ---------- Done state ----------

  if (step === 3) {
    return (
      <AuthShell>
        <Card padded>
          <StepPills />
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: `${colors.success}1F`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={34} color={colors.success} />
            </View>
            <Text variant="subheading" align="center">
              Password Reset!
            </Text>
            <Text variant="caption" color={colors.mutedForeground} align="center">
              Your password has been updated successfully.
            </Text>
            <Button
              fullWidth
              size="lg"
              style={{ marginTop: spacing.md }}
              onPress={() => router.replace("/(auth)/login")}
            >
              Sign In
            </Button>
          </View>
        </Card>
      </AuthShell>
    );
  }

  // ---------- Step 1: email ----------

  return (
    <AuthShell>
      <Card padded>
        <StepPills />

        {step === 0 ? (
          <>
            <Text variant="heading">Forgot password?</Text>
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ marginTop: 2, marginBottom: spacing.lg }}
            >
              Enter your email and we'll send a 6-digit reset code.
            </Text>

            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: 6 }}>
                <Text
                  variant="caption"
                  color={colors.mutedForeground}
                  style={{ fontWeight: "600" }}
                >
                  Account type
                </Text>
                <DataModeToggle mode={mode} onChange={setMode} />
              </View>

              <Input
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                error={error}
              />

              <Button
                fullWidth
                size="lg"
                loading={loading}
                onPress={handleSendCode}
              >
                Send Reset Code
              </Button>

              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                style={{ alignItems: "center" }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={{ fontWeight: "800", fontSize: fontSize.sm }}
                >
                  Back to sign in
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* ---------- Step 2: verify ---------- */}

        {step === 1 ? (
          <>
            <Text variant="heading">Check your email</Text>
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ marginTop: 2, marginBottom: spacing.lg }}
            >
              We sent a 6-digit code to {email}.
            </Text>

            <View style={{ gap: spacing.lg }}>
              <View style={{ gap: 6 }}>
                <Text
                  variant="caption"
                  color={colors.mutedForeground}
                  style={{ fontWeight: "600" }}
                >
                  Enter 6-digit code
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: spacing.xs,
                  }}
                >
                  {code.map((digit, i) => (
                    <TextInput
                      key={i}
                      ref={(r) => {
                        codeRefs.current[i] = r;
                      }}
                      value={digit}
                      onChangeText={(v) => setDigit(i, v)}
                      onKeyPress={(e) => onCodeKeyPress(i, e.nativeEvent.key)}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={codeBoxStyle}
                      autoFocus={i === 0}
                    />
                  ))}
                </View>
              </View>

              {error ? (
                <Text variant="caption" color={colors.destructive}>
                  {error}
                </Text>
              ) : null}

              <Button
                fullWidth
                size="lg"
                loading={loading}
                disabled={code.some((c) => !c)}
                onPress={handleVerify}
              >
                Verify Code
              </Button>

              <Pressable
                onPress={() => {
                  setStep(0);
                  setError(null);
                }}
                style={{ alignItems: "center" }}
              >
                <Text
                  variant="caption"
                  color={colors.primary}
                  style={{ fontWeight: "800", fontSize: fontSize.sm }}
                >
                  Didn't receive it? Send again
                </Text>
              </Pressable>

              <Text
                variant="caption"
                color={colors.mutedForeground}
                align="center"
                style={{ fontSize: fontSize.xs }}
              >
                Code expires in 10 minutes. Check your spam folder if you
                don't see it.
              </Text>
            </View>
          </>
        ) : null}

        {/* ---------- Step 3: new password ---------- */}

        {step === 2 ? (
          <>
            <Text variant="heading">Set new password</Text>
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ marginTop: 2, marginBottom: spacing.lg }}
            >
              Choose a strong password for your account.
            </Text>

            <View style={{ gap: spacing.lg }}>
              <Input
                label="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Min. 8 characters"
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoFocus
                rightSlot={
                  <Pressable onPress={() => setShowNew((v) => !v)} hitSlop={10}>
                    <Text
                      variant="caption"
                      color={colors.mutedForeground}
                      style={{ fontWeight: "700" }}
                    >
                      {showNew ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                }
                error={error}
              />

              <Input
                label="Confirm New Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                rightSlot={
                  <Pressable onPress={() => setShowConfirm((v) => !v)} hitSlop={10}>
                    <Text
                      variant="caption"
                      color={colors.mutedForeground}
                      style={{ fontWeight: "700" }}
                    >
                      {showConfirm ? "Hide" : "Show"}
                    </Text>
                  </Pressable>
                }
              />

              <Button
                fullWidth
                size="lg"
                loading={loading}
                onPress={handleReset}
              >
                Reset Password
              </Button>
            </View>
          </>
        ) : null}
      </Card>
    </AuthShell>
  );
}
