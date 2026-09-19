// ============================================================
// SahakariSIP — Settings → Danger Zone (legacy route)
// ============================================================
// Delete Account now lives inside Profile, but this route is kept so
// old deep-links don't break — it renders the same dialog.
// ============================================================

import React from "react";
import { Text } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";

export default function SettingsDangerScreen() {
  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Danger Zone"
          subtitle="Permanent actions"
        />
      }
    >
      <Text variant="caption" align="center">
        These actions are permanent and cannot be undone. Prefer managing
        them from Profile.
      </Text>
      <DeleteAccountDialog />
    </Screen>
  );
}
