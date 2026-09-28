// ============================================================
// SahakariSIP — "Cloud vs Local" explainer
// ============================================================
// A small link under the auth card subtitle that opens a plain-language
// comparison of the two data modes, so nobody has to guess what the
// top-right switch means before signing in.
// ============================================================

import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Check, Cloud, Smartphone } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Badge } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";

function ModeCard({
  icon,
  tint,
  title,
  subtitle,
  points,
  badge,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  points: string[];
  badge?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            height: 32,
            width: 32,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${tint}1F`,
          }}
        >
          {icon}
        </View>
        <Text variant="label" style={{ flex: 1, fontWeight: "800" }}>
          {title}
        </Text>
        {badge ? (
          <Badge bg={`${tint}1F`} color={tint}>
            {badge}
          </Badge>
        ) : null}
      </View>
      <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.sm }}>
        {subtitle}
      </Text>
      {points.map((p) => (
        <View key={p} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Check size={13} color={tint} />
          <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1 }}>
            {p}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DataModeDetailsLink() {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={6}
        style={{ alignSelf: "center", marginTop: -spacing.xs }}
      >
        <Text
          variant="caption"
          color={colors.primary}
          style={{ fontWeight: "700", fontSize: fontSize.xs }}
        >
          What's the difference between Cloud and Local?
        </Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Cloud or on-device?"
        description="Two places your SIP data can live. You can switch later, and nothing is lost when moving to Cloud."
      >
        <View style={{ gap: spacing.sm }}>
          <ModeCard
            icon={<Cloud size={17} color={colors.primary} />}
            tint={colors.primary}
            title="Cloud account"
            badge="Recommended"
            subtitle="Your portfolio lives in your online account."
            points={[
              "Sign in from any device and pick up where you left off",
              "Automatic backup. A lost phone never means lost data",
              "Needs internet to sign in and sync",
            ]}
          />
          <ModeCard
            icon={<Smartphone size={17} color={colors.amber} />}
            tint={colors.amber}
            title="On this phone"
            subtitle="Everything is stored only on this device."
            points={[
              "Works fully offline",
              "Private: nothing ever leaves the phone",
              "No email recovery. A lost phone means lost data",
            ]}
          />
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ fontSize: fontSize.xs, marginTop: spacing.xs }}
          >
            Changed your mind later? Settings → Go Cloud moves on-device data
            into your cloud account safely, with a confirmation first.
          </Text>
        </View>
      </Modal>
    </>
  );
}
