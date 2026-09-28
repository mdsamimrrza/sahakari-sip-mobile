// ============================================================
// SahakariSIP — Settings → Profile
// ============================================================
// All user details live here: identity hero, session, storage mode,
// tracked funds — plus Sign Out and Delete Account (danger zone is a
// section of Profile, not a separate top-level destination).
// ============================================================

import React, { useCallback, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { LogOut, Building2, ShieldCheck, Cloud, HardDrive, Camera, Coins } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDashboard, useFunds } from "@/hooks/useData";
import { formatCurrencyWhole, formatRelativeDate } from "@/lib/format";
import { initialOf } from "@/lib/utils";
import {
  pickAndStoreProfilePhoto,
  removeProfilePhoto,
  useProfilePhotoUri,
} from "@/lib/profilePhoto";
import { Text, Card, Avatar, Button } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";
import { useToast } from "@/components/ui/overlays";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

function GridStat({
  tint,
  icon,
  label,
  value,
}: {
  tint: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexBasis: "48%",
        flexGrow: 1,
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: `${tint}0F`,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${tint}1F`,
        }}
      >
        {icon}
      </View>
      <View style={{ gap: 1 }}>
        <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "600" }}>
          {label}
        </Text>
        <Text
          style={{ fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] }}
          color={tint}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function SettingsProfileScreen() {
  const { colors, isDark } = useTheme();
  const { user, dataMode, sessionStartedAt, signOut, refreshProfile } = useAuth();
  const { funds } = useFunds();
  const { data } = useDashboard("all");
  const totalInvested = data?.summary.totalInvested ?? 0;
  const { toast } = useToast();
  const [photoBusy, setPhotoBusy] = useState(false);
  const {
    uri: photoUri,
    hasCustom: hasCustomPhoto,
    onError: handlePhotoError,
    reload: reloadPhoto,
  } = useProfilePhotoUri(user?.id, user?.avatarUrl);

  const userEmail = user?.email ?? "Authenticated User";
  const userName =
    user?.name ||
    (userEmail.includes("@") ? userEmail.split("@")[0] : userEmail) ||
    "Portfolio Owner";
  const storageTint = dataMode === "cloud" ? colors.info : colors.amber;

  async function handlePickPhoto() {
    if (!user || photoBusy) return;
    setPhotoBusy(true);
    try {
      const stored = await pickAndStoreProfilePhoto(user.id);
      if (stored) {
        await reloadPhoto();
        toast({ title: "Profile photo updated", variant: "success" });
      }
    } catch (e) {
      toast({
        title: "Couldn't save photo",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
    setPhotoBusy(false);
  }

  async function handleRemovePhoto() {
    if (!user) return;
    await removeProfilePhoto(user.id);
    await reloadPhoto();
    toast({ title: "Profile photo removed" });
  }

  // Pull the web photo every visit — covers SQL run mid-session.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile])
  );

  return (
    <Screen header={<SettingsDetailHeader title="Profile" subtitle={userEmail} />}>
      <Card style={{ borderWidth: 0, overflow: "hidden", ...SHADOW }}>
        {/* ---------- Identity hero ---------- */}
        <View
          style={{
            backgroundColor: isDark ? "#1E293B" : colors.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: spacing.xl,
            overflow: "hidden",
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -48,
              right: -32,
              width: 136,
              height: 136,
              borderRadius: 68,
              backgroundColor: "#FFFFFF",
              opacity: 0.12,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: -62,
              right: 62,
              width: 156,
              height: 156,
              borderRadius: 78,
              backgroundColor: colors.secondary,
              opacity: 0.3,
            }}
          />
          <View style={{ alignItems: "center" }}>
            <View>
              <View
                style={{
                  borderRadius: 38,
                  borderWidth: 2,
                  borderColor: "#FFFFFF88",
                  overflow: "hidden",
                }}
              >
                {photoUri ? (
                  <Image
                    source={{ uri: photoUri }}
                    onError={handlePhotoError}
                    style={{ width: 68, height: 68 }}
                    accessibilityLabel={`${userName}'s profile photo`}
                  />
                ) : (
                  <Avatar initial={initialOf(userName)} size={68} />
                )}
              </View>
              <Pressable
                onPress={handlePickPhoto}
                disabled={photoBusy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={photoUri ? "Change profile photo" : "Add profile photo"}
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.secondary,
                  borderWidth: 2,
                  borderColor: "#FFFFFF",
                  opacity: photoBusy ? 0.6 : 1,
                }}
              >
                <Camera size={13} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.xl, fontWeight: "900", color: "#FFFFFF", marginTop: spacing.md }}
            >
              {userName}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.sm, color: "#FFFFFF", opacity: 0.85 }}
            >
              {userEmail}
            </Text>
            {sessionStartedAt ? (
              <Text
                style={{ fontSize: fontSize.xs, color: "#FFFFFF", opacity: 0.75, marginTop: 2 }}
              >
                Signed in {formatRelativeDate(sessionStartedAt)}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: spacing.sm,
              marginTop: spacing.md,
            }}
          >
            <View
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                borderRadius: radius.full,
                backgroundColor: "#FFFFFF2E",
              }}
            >
              <Text
                style={{ fontSize: fontSize.xs, fontWeight: "800", color: "#FFFFFF" }}
              >
                {dataMode === "cloud" ? "Supabase Cloud" : "On this device"}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                borderRadius: radius.full,
                backgroundColor: "#FFFFFF2E",
              }}
            >
              <Text
                style={{ fontSize: fontSize.xs, fontWeight: "800", color: "#FFFFFF" }}
              >
                {funds.length} {funds.length === 1 ? "fund" : "funds"} tracked
              </Text>
            </View>
            {hasCustomPhoto ? (
              <Pressable onPress={handleRemovePhoto} hitSlop={8} accessibilityRole="button">
                <View
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 5,
                    borderRadius: radius.full,
                    backgroundColor: "#00000033",
                  }}
                >
                  <Text
                    style={{ fontSize: fontSize.xs, fontWeight: "800", color: "#FFFFFF" }}
                  >
                    Remove photo
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ---------- Stat grid + actions ---------- */}
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            <GridStat
              tint={colors.purple}
              icon={<Building2 size={16} color={colors.purple} />}
              label="Tracked Funds"
              value={`${funds.length} Active`}
            />
            <GridStat
              tint={colors.secondary}
              icon={<Coins size={16} color={colors.secondary} />}
              label="Total Invested"
              value={formatCurrencyWhole(totalInvested)}
            />
            <GridStat
              tint={colors.success}
              icon={<ShieldCheck size={16} color={colors.success} />}
              label="Protection"
              value="Secured"
            />
            <GridStat
              tint={storageTint}
              icon={
                dataMode === "cloud" ? (
                  <Cloud size={16} color={storageTint} />
                ) : (
                  <HardDrive size={16} color={storageTint} />
                )
              }
              label="Storage"
              value={dataMode === "cloud" ? "Cloud" : "Device"}
            />
          </View>

          <View style={{ height: spacing.sm }} />

          <Button variant="outline" fullWidth onPress={() => signOut()}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.sm,
              }}
            >
              <LogOut size={16} color={colors.foreground} />
              <Text variant="label">Sign Out</Text>
            </View>
          </Button>
        </View>
      </Card>

      {/* Danger zone lives inside Profile */}
      <DeleteAccountDialog />
    </Screen>
  );
}
