// ============================================================
// SahakariSIP - Update card
// ============================================================
// Mounted once in the (app) layout. On mount it fetches the published
// release and compares it with this build:
//   - at or past latest_version      -> render nothing
//   - behind latest_version          -> dismissible card
//   - below min_version (if set)     -> blocking modal, no dismissal
// The check reruns on every app open because the layout remounts.
// ============================================================

import React, { useEffect, useState } from "react";
import { Linking, View, StyleSheet } from "react-native";
import { useTheme, radius, spacing } from "@/theme";
import { Text, Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import {
  compareVersions,
  currentAppVersion,
  fetchLatestRelease,
  type AppRelease,
} from "@/lib/updates/check";

export function UpdateCard() {
  const { colors } = useTheme();
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const latest = await fetchLatestRelease();
      if (!active || !latest) return;
      const mine = currentAppVersion();
      if (compareVersions(mine, latest.latest_version) < 0) {
        setRelease(latest);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!release) return null;

  const hardBlock =
    !!release.min_version &&
    compareVersions(currentAppVersion(), release.min_version) < 0;
  if (!hardBlock && dismissed) return null;

  const download = () => {
    if (release.apk_url) void Linking.openURL(release.apk_url);
  };

  const body = (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.lg,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <Text variant="title" style={{ fontSize: 16 }}>
        Version {release.latest_version} available
      </Text>
      {release.notes ? (
        <Text variant="caption" color={colors.mutedForeground}>
          {release.notes}
        </Text>
      ) : null}
      <Text variant="caption" color={colors.mutedForeground}>
        {hardBlock
          ? "This version is no longer supported - you must update to continue."
          : `You are running ${currentAppVersion()}.`}
      </Text>
      <Button onPress={download}>Download update</Button>
      {!hardBlock ? (
        <Button variant="ghost" onPress={() => setDismissed(true)}>
          Later
        </Button>
      ) : null}
    </View>
  );

  if (hardBlock) {
    return (
      <Modal visible onClose={() => {}}>
        <View style={styles.center}>{body}</View>
      </Modal>
    );
  }

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
});
