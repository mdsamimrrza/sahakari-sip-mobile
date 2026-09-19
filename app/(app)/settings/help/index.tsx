// ============================================================
// SahakariSIP - Settings > Help & SEBON Rules
// ============================================================
// The Nepal-specific accounting rules that make the numbers correct,
// in plain language. Same rules as src/lib/calculations + analytics.
// ============================================================

import React from "react";
import { View } from "react-native";
import { Calculator, Landmark, Wallet, Percent, TrendingUp, Receipt } from "lucide-react-native";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card } from "@/components/ui/primitives";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { SettingsDetailHeader } from "@/components/settings/menu";

const RULES: Array<{
  icon: (color: string) => React.ReactNode;
  tintKey: "emerald" | "purple" | "amber" | "rose" | "info" | "success";
  title: string;
  body: string;
}> = [
  {
    icon: (c) => <Calculator size={16} color={c} />,
    tintKey: "emerald",
    title: "Whole-unit allotment (SEBON rule)",
    body: "You can only buy whole units, never a fraction. We divide your deposit by the NAV and round down to the nearest whole unit. The small leftover amount goes to your Rollover Wallet.",
  },
  {
    icon: (c) => <Landmark size={16} color={c} />,
    tintKey: "purple",
    title: "NPR 5 flat DP charge",
    body: "Every deposit carries a flat NPR 5 depository charge. It is taken before units are bought, and you can see it in Tax & Settlement.",
  },
  {
    icon: (c) => <Wallet size={16} color={c} />,
    tintKey: "amber",
    title: "SIP Rollover Wallet",
    body: "Money left over after buying units is kept in your wallet and added to your next deposit. You can withdraw all of it whenever you exit.",
  },
  {
    icon: (c) => <Percent size={16} color={c} />,
    tintKey: "rose",
    title: "Capital Gains Tax",
    body: "Hold a fund for more than a year and your profit is taxed at 7.5%. Sell within a year and it is 10%. If you made a loss, there is no tax to pay.",
  },
  {
    icon: (c) => <TrendingUp size={16} color={c} />,
    tintKey: "info",
    title: "XIRR (yearly return)",
    body: "Your yearly return based on every deposit you have made. It appears once you have at least 3 entries.",
  },
  {
    icon: (c) => <Receipt size={16} color={c} />,
    tintKey: "success",
    title: "Net in-hand settlement",
    body: "Your current value plus rollover cash, minus the estimated tax. AMC fees are already included in the published NAV, so they are never counted twice.",
  },
];

export default function SettingsHelpScreen() {
  const { colors } = useTheme();

  return (
    <Screen
      header={<SettingsDetailHeader title="Help & SEBON Rules" subtitle="How we calculate your numbers" />}
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
            title="Nepal-specific rules"
            subtitle="The rules every Nepali mutual fund follows, and how we apply them to your numbers."
          />
          <View style={{ gap: spacing.sm }}>
            {RULES.map((rule) => {
              const tint = colors[rule.tintKey];
              return (
              <View
                key={rule.title}
                style={{
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: colors.muted,
                }}
              >
                <View
                  style={{
                    height: 34,
                    width: 34,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${tint}1F`,
                  }}
                >
                  {rule.icon(tint)}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontWeight: "800" }}>
                    {rule.title}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.mutedForeground}
                    style={{ fontSize: fontSize.sm }}
                  >
                    {rule.body}
                  </Text>
                </View>
              </View>
              );
            })}
          </View>
        </View>
      </Card>
    </Screen>
  );
}
