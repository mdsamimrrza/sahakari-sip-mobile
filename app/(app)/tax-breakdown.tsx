// ============================================================
// SahakariSIP — Tax & Settlement Ledger
// ============================================================
// Mobile port of the web app's `src/components/tax/tax-breakdown-view.tsx`
// (791 lines, desktop-table heavy). Every figure, label, formula and
// footnote is carried over verbatim; only the *presentation* changes:
//
//   • the desktop <Table> + the mobile card list collapse into one
//     card-per-row layout that reads well on a phone
//   • the 5-column tab bar becomes a bottom-sheet section picker
//     (exactly what the web app itself does below the `sm` breakpoint)
//
// The four audit sections:
//   01  Initial Cash Deposits & SEBON Charges
//   02  Units & Embedded AMC Fees
//   03  Capital Gains Tax (CGT) Schedule
//   04  Final Settlement Ledger (Bank Credit)
// ============================================================

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Receipt,
  Coins,
  ShieldCheck,
  Calculator,
  Info,
  Layers,
} from "lucide-react-native";

import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useAuth } from "@/lib/auth/AuthContext";
import { useDashboard } from "@/hooks/useData";
import {
  formatCurrencyWhole,
  formatUnits,
  formatNav,
} from "@/lib/format";
import { DP_CHARGE } from "@/lib/constants";
import { Text, Card, Badge, Separator } from "@/components/ui/primitives";
import { Screen, PageHeader, SectionHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Select } from "@/components/ui/overlays";
import { FundScopeSelector } from "@/components/dashboard/FundScopeSelector";

type SectionKey = "all" | "sec1" | "sec2" | "sec3" | "sec4";

const SECTION_OPTIONS: Array<{ value: SectionKey; label: string }> = [
  { value: "all", label: "All Sections" },
  { value: "sec1", label: "01. Upfront Fees" },
  { value: "sec2", label: "02. Units & AMC Fees" },
  { value: "sec3", label: "03. Tax Schedule" },
  { value: "sec4", label: "04. Bank Settlement" },
];

// ------------------------------------------------------------
// Small building blocks
// ------------------------------------------------------------

/** A numbered section header, mirroring the web app's CardHeader block. */
function SectionHead({
  index,
  title,
  badge,
  accent,
}: {
  index: string;
  title: string;
  badge: string;
  accent: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: colors.muted,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
        <View
          style={{
            height: 30,
            width: 30,
            borderRadius: radius.md,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${accent}22`,
            borderWidth: 2,
            borderColor: accent,
          }}
        >
          <Text style={{ fontSize: fontSize.xs, fontWeight: "900" }} color={accent}>
            {index}
          </Text>
        </View>
        <Text variant="label" style={{ flex: 1, fontWeight: "800" }} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Badge bg={`${accent}1F`} color={accent}>
        {badge}
      </Badge>
    </View>
  );
}

/** One ledger line: label + optional sub-detail on the left, value on the right. */
function LedgerRow({
  label,
  detail,
  value,
  color,
  emphasis,
  fill,
  bordered = true,
}: {
  label: string;
  detail?: string;
  value: string;
  color?: string;
  emphasis?: boolean;
  fill?: string;
  bordered?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: emphasis ? spacing.lg : spacing.md,
        backgroundColor: fill ?? "transparent",
        borderTopWidth: bordered ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          variant="caption"
          color={color ?? colors.foreground}
          style={{ fontWeight: emphasis ? "800" : "600" }}
        >
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        variant={emphasis ? "label" : "mono"}
        color={color ?? colors.foreground}
        style={{ fontWeight: emphasis ? "900" : "700" }}
        tabular
      >
        {value}
      </Text>
    </View>
  );
}

/** Top KPI card — the web app's three metric tiles. */
function MetricTile({
  icon,
  label,
  badge,
  value,
  valueColor,
  sub,
  subColor,
  highlight,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  badge: string;
  value: string;
  valueColor?: string;
  sub: string;
  subColor?: string;
  highlight?: boolean;
  accent: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <Card
      style={{
        borderColor: highlight ? `${accent}66` : colors.border,
        borderWidth: highlight ? 1.5 : 1,
        backgroundColor: isDark && highlight ? colors.card : colors.card,
      }}
    >
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1 }}>
            <View
              style={{
                height: 30,
                width: 30,
                borderRadius: radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${accent}22`,
                borderWidth: 2,
                borderColor: accent,
              }}
            >
              {icon}
            </View>
            <Text variant="micro" color={colors.mutedForeground} numberOfLines={1} style={{ flex: 1 }}>
              {label}
            </Text>
          </View>
          <Badge bg={`${accent}1F`} color={accent}>
            {badge}
          </Badge>
        </View>

        <View style={{ gap: 2 }}>
          <Text
            style={{ fontSize: fontSize.xxl, fontWeight: "900", fontVariant: ["tabular-nums"] }}
            color={valueColor ?? colors.foreground}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Text variant="caption" color={subColor ?? colors.mutedForeground} style={{ fontWeight: "600" }}>
            {sub}
          </Text>
        </View>
      </View>
    </Card>
  );
}

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------

export default function TaxBreakdownScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ fund?: string }>();
  const { user } = useAuth();

  const [selectedFundId, setSelectedFundId] = useState<string>(
    typeof params.fund === "string" ? params.fund : "all"
  );
  const [section, setSection] = useState<SectionKey>("all");

  const { data, loading, reload } = useDashboard(selectedFundId);

  const summary = data?.summary;
  const funds = data?.funds ?? [];
  const entriesCount = data?.entries.length ?? 0;
  const feeDragChart = data?.feeDragChart ?? [];

  const activeFund = useMemo(
    () => (selectedFundId === "all" ? undefined : funds.find((f) => f.id === selectedFundId)),
    [funds, selectedFundId]
  );

  // ---------- Derived figures (identical formulas to the web app) ----------
  const totalDpFeesPaid = entriesCount * DP_CHARGE;
  const totalInvested = summary?.totalInvested ?? 0;
  const unallottedCash = summary?.unallottedCash ?? 0;
  const totalUnits = summary?.totalUnits ?? 0;
  const effectiveDeployedCapital = Math.max(0, totalInvested - unallottedCash);
  const isPositive = (summary?.gainLoss ?? 0) >= 0;

  const latestFeeDrag =
    feeDragChart.length > 0 ? feeDragChart[feeDragChart.length - 1].cumulativeDrag : 0;
  const estimatedCgtLongTerm = summary?.estimatedCgtLongTerm ?? 0;
  const estimatedCgtShortTerm = summary?.estimatedCgtShortTerm ?? 0;
  const totalEstimatedCgt = estimatedCgtLongTerm + estimatedCgtShortTerm;

  const grossPortfolioValue = summary?.currentValue ?? totalInvested;
  const netInHandSettlement = grossPortfolioValue + unallottedCash - totalEstimatedCgt;
  const netCashForUnits = totalInvested - totalDpFeesPaid;
  const avgPurchaseNav = totalUnits > 0 ? totalInvested / totalUnits : null;

  const showAll = section === "all";

  return (
    <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
      {/* ---------- Header ---------- */}
      <PageHeader
        title="Tax & Settlement Ledger"
        subtitle="Complete audit of gross deposits, SEBON DP charges, AMC management fees, capital gains tax, and net bank payout."
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            height: 36,
            width: 36,
            borderRadius: radius.lg,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${colors.success}22`,
            borderWidth: 2,
            borderColor: colors.success,
          }}
        >
          <Receipt size={18} color={colors.success} />
        </View>
        {user?.mode === "local" ? (
          <Badge bg={`${colors.info}1F`} color={colors.info}>
            On-device ledger
          </Badge>
        ) : (
          <Badge bg={`${colors.success}1F`} color={colors.success}>
            IRD Nepal rules
          </Badge>
        )}
      </View>

      {/* Fund scope — mirrors `HistoryFundSelector` (hidden when only one fund) */}
      <FundScopeSelector
        funds={funds}
        selectedFundId={selectedFundId}
        onChange={setSelectedFundId}
      />

      {/* ---------- Top 3 metric tiles ---------- */}
      <View style={{ gap: spacing.md }}>
        <MetricTile
          icon={<Coins size={16} color={colors.info} />}
          label="Total Deposited"
          badge={`${entriesCount} Deposits`}
          value={formatCurrencyWhole(totalInvested)}
          sub={`SEBON DP Fees Paid: -${formatCurrencyWhole(totalDpFeesPaid)}`}
          subColor={colors.warning}
          accent={colors.info}
        />

        <MetricTile
          icon={<Calculator size={16} color={colors.rose} />}
          label="Total Taxes Owed"
          badge="IRD Nepal"
          value={formatCurrencyWhole(totalEstimatedCgt)}
          valueColor={colors.rose}
          sub={
            isPositive
              ? "Withheld on Net Realized Profit"
              : "Zero Tax on Portfolio Net Loss"
          }
          accent={colors.rose}
        />

        <MetricTile
          icon={<ShieldCheck size={16} color={colors.success} />}
          label="Net Bank Payout"
          badge="Post-Tax Cash"
          value={formatCurrencyWhole(netInHandSettlement)}
          valueColor={colors.success}
          sub={`(+) Rollover Wallet Cash: +${formatCurrencyWhole(unallottedCash)}`}
          subColor={colors.info}
          highlight
          accent={colors.success}
        />
      </View>

      {/* ---------- Section picker (the web app's mobile dropdown) ---------- */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            height: 44,
            width: 44,
            borderRadius: radius.lg,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 2,
            borderColor: colors.border,
          }}
        >
          <Layers size={18} color={colors.mutedForeground} />
        </View>
        <Select<SectionKey>
          value={section}
          options={SECTION_OPTIONS}
          onValueChange={setSection}
          placeholder="Select section…"
          containerStyle={{ flex: 1 }}
        />
      </View>

      {/* ============ SECTION 01 ============ */}
      {(showAll || section === "sec1") && (
        <Card>
          <SectionHead
            index="01"
            title="Initial Cash Deposits & SEBON Charges"
            badge="Upfront"
            accent={colors.info}
          />
          <View>
            <LedgerRow
              label="Gross Cash Deposited"
              detail={`${entriesCount} Total SIP Transactions`}
              value={formatCurrencyWhole(totalInvested)}
              bordered={false}
            />
            <LedgerRow
              label="(-) SEBON Upfront DP Fee Deducted"
              detail={`NPR 5.00 flat per deposit (${entriesCount} × NPR 5)`}
              value={`-${formatCurrencyWhole(totalDpFeesPaid)}`}
              color={colors.warning}
            />
            <LedgerRow
              label="Net Cash Available for Unit Allotment"
              detail="Deposited Cash − SEBON DP Fees"
              value={formatCurrencyWhole(netCashForUnits)}
              color={colors.success}
              fill={`${colors.success}14`}
              emphasis
            />
          </View>
        </Card>
      )}

      {/* ============ SECTION 02 ============ */}
      {(showAll || section === "sec2") && (
        <Card>
          <SectionHead
            index="02"
            title="Units & Embedded AMC Fees"
            badge="Embedded NAV"
            accent={colors.purple}
          />
          <View>
            <LedgerRow
              label="Total Allocated Units"
              detail="Integer whole units allotted by SEBON rule"
              value={`${formatUnits(totalUnits)} units`}
              bordered={false}
            />
            <LedgerRow
              label="Average Purchase NAV"
              detail="Effective cost per unit"
              value={avgPurchaseNav !== null ? `NPR ${avgPurchaseNav.toFixed(2)}` : "—"}
            />
            <LedgerRow
              label="Embedded AMC Management Fee Drag"
              detail={`~${activeFund?.fee_rate_pct || 1.5}% p.a. deducted daily by AMC`}
              value={`~${formatCurrencyWhole(latestFeeDrag)} *`}
              color={colors.purple}
              fill={`${colors.purple}12`}
            />
            <LedgerRow
              label="Effective Deployed Capital"
              detail="Cash actually converted to units"
              value={formatCurrencyWhole(effectiveDeployedCapital)}
            />
            <LedgerRow
              label="(+) Rollover Wallet Cash (Unallotted)"
              detail="100% Cash retained & fully refundable upon exit"
              value={`+${formatCurrencyWhole(unallottedCash)}`}
              color={colors.info}
              fill={`${colors.info}12`}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: spacing.sm,
              alignItems: "flex-start",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.muted,
            }}
          >
            <Info size={14} color={colors.info} style={{ marginTop: 1 }} />
            <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, fontSize: fontSize.xs }}>
              <Text variant="caption" color={colors.foreground} style={{ fontWeight: "800", fontSize: fontSize.xs }}>
                * AMC Fee Note:{" "}
              </Text>
              AMC management fees are deducted daily from fund assets before daily NAV is
              published. They are not subtracted separately upon exit.
            </Text>
          </View>
        </Card>
      )}

      {/* ============ SECTION 03 ============ */}
      {(showAll || section === "sec3") && (
        <Card>
          <SectionHead
            index="03"
            title="Capital Gains Tax (CGT) Schedule"
            badge="IRD Nepal"
            accent={colors.amber}
          />
          <View>
            <LedgerRow
              label="Long-Term Capital Gains Tax"
              detail={
                isPositive
                  ? "Held > 365 Days @ 7.5% · Positive Realized Gain"
                  : "Held > 365 Days @ 7.5% · Net Loss (NPR 0 Taxable)"
              }
              value={formatCurrencyWhole(estimatedCgtLongTerm)}
              bordered={false}
            />
            <LedgerRow
              label="Short-Term Capital Gains Tax"
              detail={
                isPositive
                  ? "Held ≤ 365 Days @ 10.0% · Positive Realized Gain"
                  : "Held ≤ 365 Days @ 10.0% · Net Loss (NPR 0 Taxable)"
              }
              value={formatCurrencyWhole(estimatedCgtShortTerm)}
            />
            <LedgerRow
              label="Total Estimated Tax Withholding"
              detail="Long term (7.5%) + Short term (10.0%)"
              value={formatCurrencyWhole(totalEstimatedCgt)}
              color={colors.rose}
              fill={`${colors.rose}12`}
              emphasis
            />
          </View>
        </Card>
      )}

      {/* ============ SECTION 04 ============ */}
      {(showAll || section === "sec4") && (
        <Card style={{ borderColor: colors.success, borderWidth: 2 }}>
          <SectionHead
            index="04"
            title="Final Settlement Ledger (Bank Credit)"
            badge="Bank Payout"
            accent={colors.success}
          />
          <View>
            <LedgerRow
              label="1. Gross Portfolio Value (@ NAV)"
              detail={`${formatUnits(totalUnits)} units × NPR ${formatNav(summary?.latestNav || 0)}`}
              value={formatCurrencyWhole(grossPortfolioValue)}
              bordered={false}
            />
            <LedgerRow
              label="2. (+) Rollover Wallet Balance"
              detail="Unused deposit cash balance"
              value={`+${formatCurrencyWhole(unallottedCash)}`}
              color={colors.info}
            />
            <LedgerRow
              label="3. (-) Total Capital Gains Tax (CGT)"
              detail="Long term (7.5%) + Short term (10.0%)"
              value={`-${formatCurrencyWhole(totalEstimatedCgt)}`}
              color={colors.rose}
            />
            <LedgerRow
              label="FINAL REALIZED IN-HAND CASH (Bank Credit)"
              value={formatCurrencyWhole(netInHandSettlement)}
              color={colors.success}
              fill={`${colors.success}1F`}
              emphasis
            />
          </View>
        </Card>
      )}

      {/* ---------- Footer note ---------- */}
      <Card padded>
        <SectionHeader title="How to read this ledger" />
        <Separator style={{ marginVertical: spacing.md }} />
        <View style={{ gap: spacing.sm }}>
          {[
            "Every figure is derived live from your entry history — nothing is stored pre-computed.",
            "SEBON rules allot whole units only; the remainder stays in your Rollover Wallet as refundable cash.",
            "AMC fees are already embedded in the published daily NAV, so they are shown for insight, not subtracted again.",
            "CGT is estimated as if you redeemed the whole portfolio today, using lot-by-lot holding periods.",
          ].map((line) => (
            <View key={line} style={{ flexDirection: "row", gap: spacing.sm }}>
              <Text variant="caption" color={colors.secondary} style={{ fontWeight: "900" }}>
                •
              </Text>
              <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, fontSize: fontSize.xs }}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
