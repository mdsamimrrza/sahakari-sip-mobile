// ============================================================
// SahakariSIP - Tax & Settlement Ledger
// ============================================================
// Mobile port of the web app's `src/components/tax/tax-breakdown-view.tsx`
// (desktop-table heavy). Every figure, label, formula and footnote is
// carried over verbatim; only the *presentation* is phone-first:
//
//   • detail-style `< Back` header (tab bar hides on this route)
//   • one compact settlement-summary card (was 3 tall tiles)
//   • chip section picker (All / 01 / 02 / 03 / 04)
//   • audit sections as collapsible accordions - short scan, tap to audit
//   • empty state when there are no SIP entries yet
//
// The four audit sections:
//   01  Initial Cash Deposits & SEBON Charges
//   02  Units & Embedded AMC Fees
//   03  Capital Gains Tax (CGT) Schedule
//   04  Final Settlement Ledger (Bank Credit)
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  UIManager,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Coins,
  ShieldCheck,
  Calculator,
  Info,
  Check,
  ChevronDown,
} from "lucide-react-native";

import { useTheme, radius, spacing, fontSize } from "@/theme";
import { useDashboard } from "@/hooks/useData";
import { usePrivacy } from "@/lib/privacy/PrivacyContext";
import {
  formatCurrencyWhole,
  formatUnits,
} from "@/lib/format";
import { formatFundShortName } from "@/lib/utils";
import { DP_CHARGE } from "@/lib/constants";
import {
  CGT_NP_REDEMPTION,
  getExitLoadSchedule,
  getTaxStatusSummary,
  TAX_DISCLAIMER,
} from "@/lib/tax";
import {
  Text,
  Card,
  Badge,
  Button,
  EmptyState,
} from "@/components/ui/primitives";
import { Screen } from "@/components/ui/layout";
import { PrivacyEyeButton } from "@/components/ui/PrivacyEyeButton";
import { SettingsDetailHeader } from "@/components/settings/menu";
import { Modal } from "@/components/ui/overlays";
import { DropdownMenu, type DropdownAnchor } from "@/components/ui/overlays";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

// Smooth expand/collapse for the accordions (no new deps - RN built-in).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

// Simple meanings of every term used on this page.
const GLOSSARY: Array<{ term: string; full: string; tintKey: "info" | "purple" | "amber" | "rose" | "success" | "emerald" }> = [
  { term: "Entry fee", full: "NPR 5 taken on every deposit before units are given.", tintKey: "info" },
  { term: "Yearly fund fee", full: "Taken a little every day inside the unit price. Shown here only for info, never charged twice.", tintKey: "purple" },
  { term: "Tax on profit", full: `${CGT_NP_REDEMPTION.longTermRatePct}% if your money stayed over 1 year, ${CGT_NP_REDEMPTION.shortTermRatePct}% if under 1 year. No profit means no tax.`, tintKey: "amber" },
  { term: "Unit price", full: "The market price of one unit on any day.", tintKey: "emerald" },
  { term: "Spare cash", full: "Leftover change from rounding to full units. You always get it back.", tintKey: "info" },
  { term: "Unit value", full: "The value of all your units at today's price.", tintKey: "success" },
  { term: "Final payout", full: "The cash you receive. Unit value plus spare cash minus tax.", tintKey: "success" },
  { term: "IRD Nepal", full: "Nepal's tax office. It sets the tax rates used here.", tintKey: "rose" },
  { term: "Exit load", full: "A fund charge if you withdraw early. Checked per fund from official docs.", tintKey: "info" },
];

// ------------------------------------------------------------
// Small building blocks
// ------------------------------------------------------------

/** Collapsible section header: number tile, full title, label pill, chevron. */
function SectionHead({
  index,
  title,
  description,
  badge,
  accent,
  open,
  onToggle,
}: {
  index: string;
  title: string;
  description?: string;
  badge: string;
  accent: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} accessibilityRole="button">
      {({ pressed }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            backgroundColor: open ? `${accent}0F` : "transparent",
            borderBottomWidth: open ? 1 : 0,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          }}
        >
          <View
            style={{
              height: 34,
              width: 34,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${accent}1F`,
            }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: "900" }} color={accent}>
              {index}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: fontSize.md, fontWeight: "800" }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {description ? (
              <Text
                color={colors.mutedForeground}
                style={{ marginTop: 1, fontSize: fontSize.xs }}
                numberOfLines={2}
              >
                {description}
              </Text>
            ) : null}
          </View>
          <Badge bg={`${accent}1F`} color={accent}>
            {badge}
          </Badge>
          <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
            <ChevronDown size={18} color={colors.mutedForeground} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** One ledger line: self-explanatory label on the left, value on the right.
 *  No subtexts — anything needing explanation lives in the glossary. */
function LedgerRow({
  label,
  sub,
  value,
  color,
  emphasis,
  fill,
  bordered = true,
}: {
  label: string;
  sub?: string;
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
        paddingVertical: emphasis ? spacing.md : spacing.sm,
        backgroundColor: fill ?? "transparent",
        borderTopWidth: bordered ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          variant="caption"
          color={color ?? colors.foreground}
          style={{ fontWeight: emphasis ? "800" : "600" }}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ fontSize: fontSize.xs }}
          >
            {sub}
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

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------

export default function TaxBreakdownScreen() {
  const { colors, isDark } = useTheme();
  const { formatPrivate } = usePrivacy();
  const params = useLocalSearchParams<{ fund?: string }>();
  const router = useRouter();

  const [selectedFundId, setSelectedFundId] = useState<string>(
    typeof params.fund === "string" ? params.fund : "all"
  );
  // Hero fund pill doubles as the scope dropdown trigger.
  const fundPillRef = useRef<any>(null);
  const [pillAnchor, setPillAnchor] = useState<DropdownAnchor | null>(null);
  const [fundMenuOpen, setFundMenuOpen] = useState(false);
  // Single-open accordion - everything starts closed; opening one
  // section closes the rest.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [howToOpen, setHowToOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

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

  const latestFeeDrag =
    feeDragChart.length > 0 ? feeDragChart[feeDragChart.length - 1].cumulativeDrag : 0;
  const estimatedCgtLongTerm = summary?.estimatedCgtLongTerm ?? 0;
  const estimatedCgtShortTerm = summary?.estimatedCgtShortTerm ?? 0;
  const totalEstimatedCgt = estimatedCgtLongTerm + estimatedCgtShortTerm;

  const grossPortfolioValue = summary?.currentValue ?? totalInvested;
  const netInHandSettlement = grossPortfolioValue + unallottedCash - totalEstimatedCgt;
  const netCashForUnits = totalInvested - totalDpFeesPaid;
  const avgPurchaseNav = totalUnits > 0 ? totalInvested / totalUnits : null;

  const toggle = (key: string) => {
    animateLayout();
    setOpen((prev) => (prev[key] ? {} : { [key]: true }));
  };

  const toggleHowTo = () => {
    animateLayout();
    setHowToOpen((v) => !v);
  };

  // ---------- Derived tax status for exit-load section ----------
  const fundNames = useMemo(
    () => funds.map((f) => f.fund_name),
    [funds]
  );
  const taxStatus = useMemo(
    () => getTaxStatusSummary(fundNames),
    [fundNames]
  );

  return (
    <Screen
      refreshing={loading}
      onRefresh={reload}
      header={
        <SettingsDetailHeader
          title="Tax & Settlement"
          subtitle="Fees, tax, and what you take home"
          right={
            <Pressable
              onPress={() => setGlossaryOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Glossary of terms"
              style={{
                height: 34,
                width: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors.info}1F`,
              }}
            >
              <Info size={17} color={colors.info} />
            </Pressable>
          }
        />
      }
    >
      {entriesCount === 0 && !loading ? (
        <Card style={{ borderWidth: 0, ...SHADOW }} padded>
          <EmptyState
            title="No deposits yet"
            description="Add your first SIP entry from History. Your deposits, fees, taxes and payout will show up here."
            action={
              <Button size="sm" onPress={() => router.push("/(app)/history")}>
                Go to History
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* ---------- Settlement summary hero ---------- */}
          <Card style={{ borderWidth: 0, overflow: "hidden", ...SHADOW }}>
            <View
              style={{
                backgroundColor: isDark ? "#1E293B" : colors.primary,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.xl,
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.md,
                overflow: "hidden",
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -50,
                  right: -34,
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: "#FFFFFF",
                  opacity: 0.12,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  bottom: -64,
                  right: 64,
                  width: 160,
                  height: 160,
                  borderRadius: 80,
                  backgroundColor: colors.secondary,
                  opacity: 0.3,
                }}
              />
              <View
                style={{
                  height: 46,
                  width: 46,
                  borderRadius: 15,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#FFFFFF2E",
                }}
              >
                <ShieldCheck size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="micro" color="#FFFFFF" style={{ opacity: 0.85 }}>
                  FINAL PAYOUT
                </Text>
                <Text
                  color="#FFFFFF"
                  style={{
                    fontSize: fontSize.xxxl,
                    fontWeight: "900",
                    fontVariant: ["tabular-nums"],
                  }}
                  numberOfLines={1}
                >
                  {formatPrivate(formatCurrencyWhole(netInHandSettlement))}
                </Text>
                <View
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 4,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 5,
                    borderRadius: radius.full,
                    backgroundColor: "#FFFFFF2E",
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.xs,
                      fontWeight: "800",
                      color: "#FFFFFF",
                    }}
                  >
                    After tax · +{formatPrivate(formatCurrencyWhole(unallottedCash))} spare cash in
                  </Text>
                </View>
              </View>
              <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  top: spacing.md,
                  right: spacing.md,
                  alignItems: "flex-end",
                  gap: spacing.sm,
                }}
              >
              <Pressable
                ref={fundPillRef}
                onPress={() => {
                  fundPillRef.current?.measureInWindow(
                    (x: number, y: number, width: number, height: number) => {
                      setPillAnchor({ x, y, width, height });
                      setFundMenuOpen(true);
                    }
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose fund scope"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: spacing.sm + 2,
                  paddingVertical: 5,
                  borderRadius: radius.full,
                  backgroundColor: "#FFFFFF",
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text
                  style={{ fontSize: fontSize.xs, fontWeight: "800", color: isDark ? "#1E293B" : colors.primary }}
                  numberOfLines={1}
                >
                  {selectedFundId === "all"
                    ? "All Funds"
                    : formatFundShortName(
                        funds.find((f) => f.id === selectedFundId)?.fund_name ?? "Fund"
                      )}
                </Text>
                <ChevronDown
                  size={12}
                  color={isDark ? "#1E293B" : colors.primary}
                  strokeWidth={3}
                />
              </Pressable>
              <PrivacyEyeButton variant="hero" />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md }}>
              <View
                style={{
                  flex: 1,
                  gap: 6,
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: `${colors.info}0F`,
                }}
              >
                <View
                  style={{
                    height: 30,
                    width: 30,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${colors.info}1F`,
                  }}
                >
                  <Coins size={15} color={colors.info} />
                </View>
                <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "600" }}>
                  Deposited ({entriesCount})
                </Text>
                <Text
                  style={{ fontSize: fontSize.lg, fontWeight: "900", fontVariant: ["tabular-nums"] }}
                  numberOfLines={1}
                >
                  {formatPrivate(formatCurrencyWhole(totalInvested))}
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  gap: 6,
                  padding: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: `${colors.rose}0F`,
                }}
              >
                <View
                  style={{
                    height: 30,
                    width: 30,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `${colors.rose}1F`,
                  }}
                >
                  <Calculator size={15} color={colors.rose} />
                </View>
                <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "600" }}>
                  Taxes owed
                </Text>
                <Text
                  color={colors.rose}
                  style={{ fontSize: fontSize.lg, fontWeight: "900", fontVariant: ["tabular-nums"] }}
                  numberOfLines={1}
                >
                  {formatPrivate(formatCurrencyWhole(totalEstimatedCgt))}
                </Text>
              </View>
            </View>
          </Card>

          {/* Hero pill fund menu — funds only */}
          {pillAnchor ? (
            <DropdownMenu
              visible={fundMenuOpen}
              onClose={() => setFundMenuOpen(false)}
              anchor={pillAnchor}
              width={Math.max(pillAnchor.width, 230)}
            >
              <View style={{ padding: spacing.xs }}>
                {funds.map((f) => {
                  const active = f.id === selectedFundId;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setSelectedFundId(f.id);
                        setFundMenuOpen(false);
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: spacing.sm,
                        paddingVertical: spacing.md,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.lg,
                        backgroundColor: active ? `${colors.primary}14` : "transparent",
                      }}
                    >
                      <Text
                        variant="caption"
                        color={active ? colors.primary : colors.foreground}
                        style={{ flex: 1, fontWeight: active ? "800" : "600" }}
                      >
                        {formatFundShortName(f.fund_name)}
                      </Text>
                      {active ? <Check size={15} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </DropdownMenu>
          ) : null}

          {/* ============ SECTION 01 ============ */}
          <Card style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.info, ...SHADOW }}>
              <SectionHead
                index="01"
                title="Money In & Entry Fees"
                description="What went in, and the small fee taken before buying"
                badge="Upfront"
                accent={colors.info}
                open={!!open.sec1}
                onToggle={() => toggle("sec1")}
              />
              {open.sec1 ? (
                <View style={{ backgroundColor: `${colors.info}08` }}>
                  <LedgerRow
                    label="Total money you added"
                    sub="Every deposit you have made so far"
                    value={formatPrivate(formatCurrencyWhole(totalInvested))}
                    bordered={false}
                  />
                  <LedgerRow
                    label={`Entry fee (NPR 5 × ${entriesCount})`}
                    sub="NPR 5 depository charge per deposit"
                    value={`-${formatPrivate(formatCurrencyWhole(totalDpFeesPaid))}`}
                    color={colors.warning}
                  />
                  <LedgerRow
                    label="Money that bought units"
                    sub="Deposits minus the entry fees"
                    value={formatPrivate(formatCurrencyWhole(netCashForUnits))}
                    color={colors.success}
                    fill={`${colors.success}14`}
                    emphasis
                  />
                </View>
              ) : null}
            </Card>

          {/* ============ SECTION 02 ============ */}
          <Card style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.purple, ...SHADOW }}>
              <SectionHead
                index="02"
                title="Units & Yearly Fund Fee"
                description="How your money became units, and the yearly fee"
                badge="Fee"
                accent={colors.purple}
                open={!!open.sec2}
                onToggle={() => toggle("sec2")}
              />
              {open.sec2 ? (
                <View style={{ backgroundColor: `${colors.purple}08` }}>
                  <LedgerRow
                    label="Units you own"
                    sub="Whole units, never fractions"
                    value={`${formatUnits(totalUnits)} units`}
                    bordered={false}
                  />
                  <LedgerRow
                    label="Average buying price"
                    sub="Total spent divided by units owned"
                    value={avgPurchaseNav !== null ? formatPrivate(`NPR ${avgPurchaseNav.toFixed(2)}`) : "-"}
                  />
                  <LedgerRow
                    label={`Yearly fund fee, in price (${activeFund?.fee_rate_pct || 1.5}%)`}
                    sub="Already included in the published price"
                    value={`About ${formatPrivate(formatCurrencyWhole(latestFeeDrag))} *`}
                    color={colors.purple}
                    fill={`${colors.purple}12`}
                  />
                  <LedgerRow
                    label="Money turned into units"
                    sub="What is actually working in the fund"
                    value={formatPrivate(formatCurrencyWhole(effectiveDeployedCapital))}
                  />
                  <LedgerRow
                    label="(+) Spare cash back to you"
                    sub="Leftover that could not buy a whole unit"
                    value={`+${formatPrivate(formatCurrencyWhole(unallottedCash))}`}
                    color={colors.info}
                    fill={`${colors.info}12`}
                  />
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
                      * The yearly fund fee is taken a little every day before
                      the price is published, so it is never charged again later.
                    </Text>
                  </View>
                </View>
              ) : null}
            </Card>

          {/* ============ SECTION 03 ============ */}
  <Card style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.amber, ...SHADOW }}>
      <SectionHead
        index="03"
        title="Tax on Your Profit"
        description="Tax on the profit, by how long you held"
        badge="IRD Nepal"
        accent={colors.amber}
        open={!!open.sec3}
        onToggle={() => toggle("sec3")}
      />
      {open.sec3 ? (
        <View style={{ backgroundColor: `${colors.amber}08` }}>
          <LedgerRow
            label={`Long-term tax ${CGT_NP_REDEMPTION.longTermRatePct}% (over 1 year)`}
            sub="Units held for more than a year"
            value={formatPrivate(formatCurrencyWhole(estimatedCgtLongTerm))}
            bordered={false}
          />
          <LedgerRow
            label={`Short-term tax ${CGT_NP_REDEMPTION.shortTermRatePct}% (under 1 year)`}
            sub="Units sold within a year"
            value={formatPrivate(formatCurrencyWhole(estimatedCgtShortTerm))}
          />
          <LedgerRow
            label="Total tax to pay"
            sub="Owed when you sell, paid to IRD Nepal"
            value={formatPrivate(formatCurrencyWhole(totalEstimatedCgt))}
            color={colors.rose}
            fill={`${colors.rose}12`}
            emphasis
          />
        </View>
      ) : null}
    </Card>

          {/* ============ SECTION 04 ============ */}
          <Card style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.success, backgroundColor: `${colors.success}0A`, ...SHADOW }}>
              <SectionHead
                index="04"
                title="Final Payout to Your Bank"
                description="The amount that reaches your bank"
                badge="Payout"
                accent={colors.success}
                open={!!open.sec4}
                onToggle={() => toggle("sec4")}
              />
              {open.sec4 ? (
                <View>
                  <LedgerRow
                    label="1. Value of your units"
                    sub="Units times the latest NAV"
                    value={formatPrivate(formatCurrencyWhole(grossPortfolioValue))}
                    bordered={false}
                  />
                  <LedgerRow
                    label="2. (+) Spare cash"
                    sub="Your rollover wallet, fully refundable"
                    value={`+${formatPrivate(formatCurrencyWhole(unallottedCash))}`}
                    color={colors.info}
                  />
                  <LedgerRow
                    label="3. (-) Total tax"
                    sub="From section 03 above"
                    value={`-${formatPrivate(formatCurrencyWhole(totalEstimatedCgt))}`}
                    color={colors.rose}
                  />
                  <LedgerRow
                    label="CASH YOU RECEIVE"
                    sub="What actually reaches your bank"
                    value={formatPrivate(formatCurrencyWhole(netInHandSettlement))}
                    color={colors.success}
                    fill={`${colors.success}1F`}
                    emphasis
                  />
                </View>
              ) : null}
            </Card>

          {/* ============ SECTION 05: Verified Exit-Load Rules ============ */}
          {taxStatus.exitLoadVerified.length > 0 || taxStatus.exitLoadUnverified.length > 0 ? (
            <Card style={{ borderWidth: 0, borderLeftWidth: 3, borderLeftColor: colors.info, ...SHADOW }}>
              <SectionHead
                index="05"
                title="Exit-Load Rules (Fund Charges, Not Tax)"
                description="Applied at redemption based on each lot's holding period"
                badge={taxStatus.exitLoadVerified.length > 0 ? "Verified" : "Unverified"}
                accent={colors.info}
                open={!!open.sec5}
                onToggle={() => toggle("sec5")}
              />
              {open.sec5 ? (
                <View style={{ backgroundColor: `${colors.info}08`, gap: spacing.md }}>
                  {taxStatus.exitLoadVerified.map((v) => {
                    const schedule = getExitLoadSchedule(v.fundName);
                    return (
                      <View
                        key={v.fundName}
                        style={{
                          flexDirection: "row",
                          gap: spacing.sm,
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
                            backgroundColor: `${colors.success}1F`,
                          }}
                        >
                          <Check size={16} color={colors.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text variant="label" style={{ fontWeight: "800" }}>
                            {v.fundName}
                          </Text>
                          {schedule && (
                            <Text
                              variant="caption"
                              color={colors.mutedForeground}
                              style={{ fontSize: fontSize.xs }}
                            >
                              {schedule.tiers
                                .map((t) =>
                                  t.maxDays === null
                                    ? `${t.ratePct}% thereafter`
                                    : `${t.ratePct}% if held under ${t.maxDays} days`
                                )
                                .join(", ")}
                            </Text>
                          )}
                          {v.sourceUrl && (
                            <Text
                              variant="caption"
                              color={colors.primary}
                              style={{ marginTop: 2, fontSize: fontSize.xs }}
                            >
                              Verified source: {v.sourceUrl}
                            </Text>
                          )}
                        </View>
                        <Badge bg={`${colors.success}1F`} color={colors.success}>
                          VERIFIED
                        </Badge>
                      </View>
                    );
                  })}
                  {taxStatus.exitLoadUnverified.map((name) => (
                    <View
                      key={name}
                      style={{
                        flexDirection: "row",
                        gap: spacing.sm,
                        padding: spacing.md,
                        borderRadius: radius.lg,
                        backgroundColor: `${colors.warning}0F`,
                        borderWidth: 1,
                        borderColor: `${colors.warning}33`,
                      }}
                    >
                      <View
                        style={{
                          height: 34,
                          width: 34,
                          borderRadius: 11,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: `${colors.warning}1F`,
                        }}
                      >
                        <Info size={16} color={colors.warning} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="label" style={{ fontWeight: "800" }}>
                          {name}
                        </Text>
                        <Text
                          variant="caption"
                          color={colors.mutedForeground}
                          style={{ fontSize: fontSize.xs }}
                        >
                          Exit-load rules could not be verified — no rate assumed.
                        </Text>
                      </View>
                      <Badge bg={`${colors.warning}1F`} color={colors.warning}>
                        NOT VERIFIED
                      </Badge>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : null}

          {/* ---------- How to read (collapsed by default) ---------- */}
          <Card style={{ borderWidth: 0, ...SHADOW }}>
            <Pressable onPress={toggleHowTo} accessibilityRole="button">
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    opacity: pressed ? 0.6 : 1,
                  }}
                >
                  <Info size={16} color={colors.mutedForeground} />
                  <Text variant="label" style={{ flex: 1, fontWeight: "700" }}>
                    Need help?
                  </Text>
                  <View style={{ transform: [{ rotate: howToOpen ? "180deg" : "0deg" }] }}>
                    <ChevronDown size={17} color={colors.mutedForeground} />
                  </View>
                </View>
              )}
            </Pressable>
            {howToOpen ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }}>
                {[
                  "All numbers are worked out live from your entries. Nothing is pre-saved.",
                  "You only get full units. Leftover cash stays in your balance and comes back to you.",
                  "The yearly fund fee is already inside the daily price, so it is only shown for info and never charged twice.",
                  "Tax is estimated as if you withdrew everything today, checking how long each payment stayed invested.",
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
            ) : null}
          </Card>
        </>
      )}

      {/* ---------- Glossary bottom sheet ---------- */}
      <Modal
        visible={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        position="bottom"
        title="What the words mean"
        description="Simple meanings of every term used on this page."
        footer={
          <Button fullWidth onPress={() => setGlossaryOpen(false)}>
            Got it
          </Button>
        }
      >
        <View style={{ gap: spacing.sm }}>
          {GLOSSARY.map((item) => {
            const tint = colors[item.tintKey];
            return (
              <View
                key={item.term}
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
                  <Info size={15} color={tint} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" style={{ fontWeight: "800" }}>
                    {item.term}
                  </Text>
                  <Text
                    variant="caption"
                    color={colors.mutedForeground}
                    style={{ fontSize: fontSize.sm }}
                  >
                    {item.full}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Modal>

      {/* ---------- Disclaimer ---------- */}
      <Text
        variant="caption"
        color={colors.mutedForeground}
        style={{
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          fontSize: fontSize.xs,
          lineHeight: 18,
        }}
      >
        {TAX_DISCLAIMER}
      </Text>
    </Screen>
  );
}
