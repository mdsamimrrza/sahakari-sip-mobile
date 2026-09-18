// ============================================================
// SahakariSIP — Fund scope selector
// ============================================================
// The web app scopes the dashboard via a `?fund=<id>` query param driven
// by a Select. On mobile a horizontal chip row is the equivalent and is
// far easier to hit with a thumb.
// ============================================================

import React from "react";
import { ScrollView, Pressable, View } from "react-native";
import { useTheme, radius, spacing } from "../../theme";
import { Text } from "../ui/primitives";
import { formatFundShortName } from "../../lib/utils";
import type { FundConfig } from "../../lib/types";

export function FundScopeSelector({
  funds,
  selectedFundId,
  onChange,
  style,
}: {
  funds: FundConfig[];
  selectedFundId: string;
  onChange: (fundId: string) => void;
  style?: object;
}) {
  const { colors } = useTheme();

  if (funds.length <= 1) return null;

  const options = [
    { id: "all", label: "All Funds" },
    ...funds.map((f) => ({ id: f.id, label: formatFundShortName(f.fund_name) })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      style={style}
    >
      {options.map((opt) => {
        const active = opt.id === selectedFundId;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 8,
              borderRadius: radius.md,
              backgroundColor: active ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
            }}
          >
            <Text
              variant="caption"
              color={active ? colors.primaryForeground : colors.mutedForeground}
              style={{ fontWeight: "800" }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
