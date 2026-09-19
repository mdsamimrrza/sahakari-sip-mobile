// ============================================================
// SahakariSIP — Settings → My Funds
// ============================================================
// Fund CRUD (search + 5-per-page pagination + presets) lives here
// instead of on the hub, keeping the hub a pure navigation list.
// ============================================================

import React from "react";
import { useFunds } from "@/hooks/useData";
import { Text, Card } from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { FundConfigForm } from "@/components/settings/FundConfigForm";
import { Skeleton } from "@/components/ui/primitives";
import { View } from "react-native";
import { spacing } from "@/theme";

export default function SettingsFundsScreen() {
  const { funds, loading, reload } = useFunds();

  return (
    <Screen
      header={
        <SettingsDetailHeader
          title="My Funds"
          subtitle={`${funds.length} tracked`}
        />
      }
    >
      {loading ? (
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
          <Skeleton height={22} width="55%" />
          <View style={{ height: spacing.md }} />
          <Skeleton height={80} />
          <View style={{ height: spacing.sm }} />
          <Skeleton height={80} />
        </Card>
      ) : (
        <FundConfigForm funds={funds} onChanged={reload} />
      )}
      <Text variant="caption" align="center" style={{ opacity: 0.7 }}>
        A fund with existing SIP entries cannot be deleted until its entries
        are removed first.
      </Text>
    </Screen>
  );
}
