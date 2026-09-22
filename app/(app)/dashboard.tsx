// ============================================================
// SahakariSIP — Dashboard
// ============================================================
// Port of the web app's (app)/dashboard/page.tsx:
//   • 4 KPI summary cards + personal summary sheet
//   • Latest NAV inline editor (any fund via picker in "All" scope)
//   • Portfolio growth chart with time ranges
//   • NAV history, monthly contributions, invested-vs-gain, fee drag
// Redirects to /onboarding when no funds are configured yet, exactly
// like the server component does.
// ============================================================

import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Redirect } from "expo-router";
import { Plus } from "lucide-react-native";
import { useDashboard } from "@/hooks/useData";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, radius, spacing } from "@/theme";
import { Screen, PageHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { NavEditModal } from "@/components/dashboard/NavEditModal";
import {
  FeeDragCard,
  InvestedVsGainCard,
  MonthlyContributionsCard,
  NavHistoryCard,
  PortfolioGrowthCard,
} from "@/components/dashboard/DashboardCharts";
import { EntryFormModal } from "@/components/entries/EntryFormModal";
import type { FundConfig } from "@/lib/types";
import { formatFundShortName } from "@/lib/utils";

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { user, hasUnmergedLocalData } = useAuth();
  const [fundId, setFundId] = useState<string>("all");
  const [entryOpen, setEntryOpen] = useState(false);
  const [navEditOpen, setNavEditOpen] = useState(false);

  const { data, loading, error, reload } = useDashboard(fundId);

  // An empty cloud account may still be waiting on the "Move phone data to
  // cloud" merge (Settings → Data) — hold off the onboarding bounce unless
  // we positively know there's nothing left to bring in.
  if (
    !loading &&
    data &&
    data.funds.length === 0 &&
    hasUnmergedLocalData !== true
  ) {
    return <Redirect href="/onboarding" />;
  }

  const funds: FundConfig[] = data?.funds ?? [];
  const activeFund =
    funds.find((f) => f.id === fundId) || (fundId === "all" ? undefined : funds[0]);

  const feeRatePct =
    fundId !== "all" && activeFund
      ? Number(activeFund.fee_rate_pct || 0)
      : funds.length > 0
        ? funds.reduce((s, f) => s + Number(f.fee_rate_pct || 0), 0) / funds.length
        : 0;

  // Personal greeting — full name when short, first name when long.
  const email = user?.email ?? "";
  const displayName =
    user?.name ||
    (email.includes("@") ? email.split("@")[0] : email) ||
    "Investor";
  const greetName =
    displayName.length > 14 ? displayName.split(" ")[0] : displayName;
  const hour = new Date().getHours();
  const daypart =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
        <PageHeader
          title={`Hi ${greetName} 🇳🇵`}
          subtitle={`${daypart} — here's your portfolio at a glance.`}
          right={
            <Pressable
              onPress={() => setEntryOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add SIP entry"
              style={{
                height: 44,
                width: 44,
                borderRadius: radius.lg,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.primary,
              }}
            >
              <Plus size={20} color={colors.primaryForeground} strokeWidth={2.6} />
            </Pressable>
          }
        />

        {error && !data ? (
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
            <Text variant="label" color={colors.destructive}>
              Could not load your dashboard
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: 4 }}>
              {error}
            </Text>
          </Card>
        ) : null}

        {loading && !data ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={128} />
            <Skeleton height={240} />
            <Skeleton height={200} />
          </View>
        ) : null}

        {data ? (
          <>
            <SummaryCards
              summary={data.summary}
              funds={funds}
              selectedFundId={fundId}
              onFundChange={setFundId}
              activeFund={activeFund}
              loading={loading && !data}
            />

            <PortfolioGrowthCard
              data={data.portfolioChart}
              summary={data.summary}
            />

            <NavHistoryCard
              data={data.navHistory}
              onEditNav={() => setNavEditOpen(true)}
            />

            <InvestedVsGainCard
              totalInvested={data.summary.totalInvested}
              currentValue={data.summary.currentValue}
            />

            <MonthlyContributionsCard data={data.monthlyContributions} />

            <FeeDragCard
              data={data.feeDragChart}
              feeRatePct={feeRatePct}
              fundName={
                fundId !== "all" && activeFund
                  ? formatFundShortName(activeFund.fund_name)
                  : undefined
              }
            />
          </>
        ) : null}
      </Screen>

      <EntryFormModal
        visible={entryOpen}
        onClose={() => setEntryOpen(false)}
        funds={funds}
        defaultFundId={activeFund?.id}
        onSaved={reload}
      />

      <NavEditModal
        visible={navEditOpen}
        onClose={() => setNavEditOpen(false)}
        funds={funds}
        defaultFundId={fundId !== "all" ? activeFund?.id : undefined}
        onUpdated={reload}
      />
    </>
  );
}
