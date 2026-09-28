// ============================================================
// SahakariSIP — Settings → About & Review
// ============================================================
// Version card + the reference mock's "Rate & Review" row, adapted:
// mobile review goes to the store listing (best-effort link).
// ============================================================

import React from "react";
import { Linking, Pressable, View } from "react-native";
import { Star, Coins, User, ChevronRight, Download } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { APP_DOWNLOAD_URL } from "@/lib/constants";
import { Text, Card } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { useToast } from "@/components/ui/overlays";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export default function SettingsAboutScreen() {
  const { colors } = useTheme();
  const { cloudAvailable } = useAuth();
  const { toast } = useToast();

  async function handleRate() {
    // No store URL is configured for this build — report honestly.
    toast({
      title: "Thanks for your support!",
      description: "The Play Store listing isn't linked yet — check back soon.",
    });
  }

  async function handleDownload() {
    try {
      await Linking.openURL(APP_DOWNLOAD_URL);
    } catch {
      toast({
        title: "Couldn't open the link",
        description: APP_DOWNLOAD_URL,
      });
    }
  }

  return (
    <Screen header={<SettingsDetailHeader title="About" subtitle="About the app · v1.0.0" />}>
      <Card style={{ borderWidth: 0, ...SHADOW }}>
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="About SahakariSIP"
            subtitle={`Version 1.0.0 · ${cloudAvailable ? "Cloud ready" : "Offline only"}`}
          />
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.muted,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.secondary}1F`,
                }}
              >
                <Coins size={16} color={colors.secondary} />
              </View>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ flex: 1, fontSize: fontSize.sm }}
              >
                SEBON-accurate whole-unit allotment with a refundable SIP
                Rollover Wallet.
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                padding: spacing.md,
                borderRadius: radius.lg,
                backgroundColor: colors.muted,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.emerald}1F`,
                }}
              >
                <User size={16} color={colors.emerald} />
              </View>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ flex: 1, fontSize: fontSize.sm }}
              >
                XIRR (Newton-Raphson), SIP streak tracking, and lot-based
                capital gains tax.
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.lg,
          ...SHADOW,
        }}
      >
        <Pressable onPress={handleDownload}>
          {({ pressed }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: 14,
                opacity: pressed ? 0.55 : 1,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.primary}1F`,
                }}
              >
                <Download size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: "500" }}>
                  Download Latest APK
                </Text>
                <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
                  Grab the newest release from GitHub
                </Text>
              </View>
              <ChevronRight
                size={18}
                color={colors.mutedForeground}
                strokeWidth={1.8}
                style={{ opacity: 0.6 }}
              />
            </View>
          )}
        </Pressable>

        <View style={{ height: 1, backgroundColor: colors.border }} />

        <Pressable onPress={handleRate}>
          {({ pressed }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                paddingVertical: 14,
                opacity: pressed ? 0.55 : 1,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: `${colors.secondary}1F`,
                }}
              >
                <Star size={18} color={colors.secondary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: "500" }}>
                  Rate &amp; Review
                </Text>
              </View>
              <ChevronRight
                size={18}
                color={colors.mutedForeground}
                strokeWidth={1.8}
                style={{ opacity: 0.6 }}
              />
            </View>
          )}
        </Pressable>
      </View>

      <Text variant="caption" align="center" color={colors.mutedForeground}>
        Made for Nepali mutual-fund SIP investors.
      </Text>
    </Screen>
  );
}
