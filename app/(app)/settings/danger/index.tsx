// ============================================================
// SahakariSIP — Settings → Danger Zone
// ============================================================
// Matches the web app's danger zone: shows fund/entry counts
// and the delete account dialog with "DELETE" confirmation.
// ============================================================

import React from "react";
import { useFunds, useEntries } from "@/hooks/useData";
import { useTheme } from "@/theme";
import { Text } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";

export default function SettingsDangerScreen() {
  const { colors } = useTheme();
  const { funds } = useFunds();
  const { entries } = useEntries("all");

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="Danger Zone"
          subtitle="Irreversible actions"
        />
      }
    >
      <Text variant="caption" align="center" color={colors.mutedForeground}>
        These actions are permanent and cannot be undone. Prefer managing
        them from Profile.
      </Text>
      <DeleteAccountDialog fundCount={funds.length} entryCount={entries.length} />
    </Screen>
  );
}
