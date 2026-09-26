// ============================================================
// SahakariSIP - Settings > Password & Security
// ============================================================
// Cloud profiles reset via Supabase email; on-device profiles honestly
// report that there is no email recovery channel (same rule as the web
// app's forgot-password screen).
// ============================================================

import React, { useState } from "react";
import { Switch, View } from "react-native";
import { ShieldCheck, Mail, Smartphone, Fingerprint } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { Text, Card, Button, Badge } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { useToast } from "@/components/ui/overlays";

export default function SettingsSecurityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    user,
    dataMode,
    cloudAvailable,
    requestPasswordReset,
    biometricSupported,
    biometricEnabled,
    enableBiometric,
    disableBiometric,
  } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const userEmail = user?.email ?? "";

  async function handleReset() {
    if (!userEmail) return;
    setSending(true);
    const res = await requestPasswordReset(userEmail, dataMode);
    setSending(false);
    if (res.success) {
      toast({
        title: "Reset email sent",
        description: `Check ${userEmail} for the recovery link.`,
        variant: "success",
      });
    } else {
      toast({
        title: "Reset unavailable",
        description: res.error ?? "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function handleBiometricToggle(on: boolean) {
    if (on) {
      const res = await enableBiometric();
      if (res.success) {
        toast({
          title: "Fingerprint unlock enabled",
          description: "Next time you log out, just use your fingerprint.",
          variant: "success",
        });
      } else {
        toast({
          title: "Could not enable",
          description: res.error ?? "Please try again.",
          variant: "destructive",
        });
      }
    } else {
      await disableBiometric();
      toast({
        title: "Fingerprint unlock turned off",
        description: "Logging out will now require your password.",
      });
    }
  }

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Password & Security"
          subtitle={dataMode === "cloud" ? "Cloud account" : "On this phone"}
        />
      }
    >
      <Card
        style={{
          borderWidth: 0,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="Auth Protection"
            subtitle={
              dataMode === "cloud"
                ? "Your email and password keep your account safe. Only you can see your portfolio."
                : "Your profile is saved on this phone only and never leaves it."
            }
            right={
              <Badge bg={`${colors.success}1F`} color={colors.success}>
                Secured
              </Badge>
            }
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.lg,
              backgroundColor: colors.muted,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {dataMode === "cloud" ? (
              <Mail size={15} color={colors.info} />
            ) : (
              <Smartphone size={15} color={colors.amber} />
            )}
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ flex: 1, fontSize: fontSize.sm }}
            >
              {dataMode === "cloud"
                ? `Signed in as ${userEmail}. Password reset emails go to this address.`
                : "This profile exists only on your phone, so it can't be recovered by email if you forget your password."}
            </Text>
          </View>

          {dataMode === "cloud" && cloudAvailable ? (
            <Button fullWidth onPress={handleReset} loading={sending}>
              Send password reset email
            </Button>
          ) : (
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ fontSize: fontSize.sm }}
            >
              Forgot your password? Sign out and use your recovery key via
              "Forgot password?" on the sign-in screen. Lost the key means
              the profile cannot be recovered.
            </Text>
          )}
        </View>
      </Card>

      <Card
        padded
        style={{
          borderWidth: 0,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Fingerprint size={16} color={colors.primary} />
          <Text variant="label" style={{ flex: 1, fontWeight: "800" }}>
            Biometric unlock
          </Text>
          <Switch
            value={biometricEnabled}
            disabled={!biometricSupported}
            onValueChange={handleBiometricToggle}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}
        >
          {biometricSupported
            ? "Log out with a fingerprint waiting for you. Your fingerprint stays on this device and is never sent anywhere."
            : "Not available on this device. Add a fingerprint or face unlock in your phone's settings first."}
        </Text>
      </Card>

      <Card
        padded
        style={{
          borderWidth: 0,
          shadowColor: "#000",
          shadowOpacity: 0.07,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <ShieldCheck size={16} color={colors.success} />
          <Text variant="label" style={{ fontWeight: "800" }}>
            Keep your account safe
          </Text>
        </View>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ marginTop: spacing.sm, fontSize: fontSize.sm }}
        >
          Use at least 8 characters and don't share your password with anyone.
          No one from SahakariSIP will ever ask for it. Deleting your account
          from Profile removes all your data for good.
        </Text>
      </Card>
    </Screen>
  );
}
