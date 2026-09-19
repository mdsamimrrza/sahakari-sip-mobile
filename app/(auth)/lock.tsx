// ============================================================
// SahakariSIP — Lock screen (biometric unlock)
// ============================================================
// Shown when the app is "locked" (logged out with biometric armed).
// The fingerprint never reaches a server — it just releases the stored
// session, which silently restores the user exactly like a fresh login.
// ============================================================

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { Fingerprint, LockKeyhole } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, spacing, fontSize } from "@/theme";
import { Text, Button } from "@/components/ui/primitives";
import { AuthShell } from "@/components/layout/AuthShell";
import { useToast } from "@/components/ui/overlays";

export default function LockScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { lockInfo, unlockWithBiometric, status } = useAuth();
  const { toast } = useToast();
  const [unlocking, setUnlocking] = useState(false);

  // Session expired while unlocking (revoked token) → fall back to login.
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/(auth)/login");
    }
  }, [status, router]);

  async function handleUnlock() {
    setUnlocking(true);
    const res = await unlockWithBiometric();
    setUnlocking(false);
    if (res.success) {
      router.replace("/(app)/dashboard");
    } else if (res.error && res.error !== "Not verified." && status === "locked") {
      toast({
        title: "Unlock failed",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  return (
    <AuthShell compact>
      <View
        style={{
          alignItems: "center",
          gap: spacing.lg,
          paddingVertical: spacing.xl,
        }}
      >
        <View
          style={{
            height: 88,
            width: 88,
            borderRadius: 44,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${colors.primary}14`,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Fingerprint size={44} color={colors.primary} />
        </View>

        <View style={{ alignItems: "center", gap: 4 }}>
          <Text variant="title" align="center">
            Welcome back
          </Text>
          <Text variant="caption" color={colors.mutedForeground} align="center">
            {lockInfo?.name || lockInfo?.email || "Unlock to continue"}
          </Text>
        </View>

        <View style={{ width: "100%", gap: spacing.sm, marginTop: spacing.sm }}>
          <Button
            fullWidth
            size="lg"
            loading={unlocking}
            onPress={handleUnlock}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <Fingerprint size={19} color={colors.primaryForeground} />
              <Text variant="label" color={colors.primaryForeground} style={{ fontSize: fontSize.base }}>
                Unlock with fingerprint
              </Text>
            </View>
          </Button>

          <Button
            variant="ghost"
            fullWidth
            disabled={unlocking}
            onPress={() => router.replace("/(auth)/login")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <LockKeyhole size={14} color={colors.mutedForeground} />
              <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700" }}>
                Use your password instead
              </Text>
            </View>
          </Button>
        </View>

        <Text
          variant="caption"
          color={colors.mutedForeground}
          align="center"
          style={{ fontSize: fontSize.xs, marginTop: spacing.sm }}
        >
          Your fingerprint stays on this device. It only unlocks the app.
        </Text>
      </View>
    </AuthShell>
  );
}
