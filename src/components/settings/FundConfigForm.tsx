// ============================================================
// SahakariSIP - Fund Configuration Manager
// ============================================================
// Mobile port of `src/components/settings/fund-config-form.tsx`.
// Behaviour kept identical:
//   • search bar appears once there are 4+ funds
//   • 5 funds per page with numbered quick-jump pagination
//   • create / edit share one form, pre-filled from FUND_PRESETS
//   • presets fill the name + fee rate but never overwrite the
//     user's monthly SIP or NAV (same rule as the web app)
//   • a fund that still has SIP entries cannot be deleted - the
//     store rejects it and we surface the reason
// ============================================================

import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";

import { useTheme, radius, spacing, fontSize } from "../../theme";
import { useAuth } from "../../lib/auth/AuthContext";
import { FUND_PRESETS, MIN_SIP_AMOUNT } from "../../lib/constants";
import { formatCurrencyWhole, formatDate } from "../../lib/format";
import { todayKey } from "../../lib/format";
import type { FundConfig } from "../../lib/types";
import {
  Text,
  Card,
  CardHeader,
  CardTitle,
  Button,
  Input,
  EmptyState,
} from "../ui/primitives";
import { Modal, Select, useToast } from "../ui/overlays";
import { DateField } from "../ui/DateField";
import {
  SIPScheduleFields,
  scheduleToFormFields,
  EMPTY_SCHEDULE,
  type SIPScheduleValue,
} from "./sip-schedule-fields";

const ITEMS_PER_PAGE = 5;

// Accent palette cycled per fund row — tinted stripe, initial tile, stat icons.
const ROW_ACCENTS = [
  { tint: "#147A64", bg: "#147A6414" }, // teal
  { tint: "#A8791F", bg: "#A8791F14" }, // brass
  { tint: "#2A6F86", bg: "#2A6F8614" }, // aqua
  { tint: "#047857", bg: "#04785714" }, // emerald
  { tint: "#A5442B", bg: "#A5442B14" }, // rust
];

/** Up to two initials from a fund name: "NMB Saral Bachat" -> "NS". */
function fundInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** One column in the fund row's stat strip. */
function FundStat({
  label,
  value,
  color,
  flex = 1,
}: {
  label: string;
  value: string;
  color: string;
  flex?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex, gap: 2 }}>
      <Text
        variant="micro"
        color={colors.mutedForeground}
        style={{ fontSize: 9, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" }}
      >
        {label}
      </Text>
      <Text
        variant="caption"
        color={color}
        style={{ fontWeight: "900", fontSize: fontSize.sm }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

interface FormState {
  fundName: string;
  feeRate: string;
  startDate: string;
  monthlySip: string;
  latestNav: string;
  preset: string;
}

const EMPTY_FORM: FormState = {
  fundName: "",
  feeRate: "1.80",
  startDate: todayKey(),
  monthlySip: "5000",
  latestNav: "10.00",
  preset: "",
};

export function FundConfigForm({
  funds,
  onChanged,
}: {
  funds: FundConfig[];
  /** Called after a successful create/update/delete so the host screen
   * can refetch immediately instead of waiting for the next focus. */
  onChanged?: () => void;
}) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<FundConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [schedule, setSchedule] = useState<SIPScheduleValue>(EMPTY_SCHEDULE);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // ---------- Filter + paginate (identical maths to the web app) ----------
  const filteredFunds = useMemo(
    () =>
      funds.filter((f) =>
        f.fund_name.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [funds, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredFunds.length / ITEMS_PER_PAGE));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedFunds = filteredFunds.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // ---------- Form helpers ----------

  function openCreate() {
    setEditingFund(null);
    setForm(EMPTY_FORM);
    // SIP start date defaults to the registration (Start Date) value.
    setSchedule({ ...EMPTY_SCHEDULE, anchorDate: EMPTY_FORM.startDate });
    setFormError(null);
    setOpen(true);
  }

  function openEdit(fund: FundConfig) {
    const preset = FUND_PRESETS.find((p) => p.name === fund.fund_name);
    setEditingFund(fund);
    setForm({
      fundName: fund.fund_name,
      feeRate: fund.fee_rate_pct.toString(),
      startDate: fund.start_date,
      monthlySip: fund.monthly_sip.toString(),
      latestNav: fund.latest_nav ? fund.latest_nav.toString() : "",
      preset: preset ? preset.name : "custom",
    });
    // Pre-fill the registered schedule so it survives edits (same as web).
    // An older fund without an explicit anchor inherits its start date.
    setSchedule({
      frequency: (fund.frequency as SIPScheduleValue["frequency"]) ?? null,
      anchorDate: fund.anchor_date ?? fund.start_date ?? null,
      verified: Boolean(fund.schedule_verified),
    });
    setFormError(null);
    setOpen(true);
  }

  function applyPreset(value: string) {
    setForm((prev) => {
      if (!value || value === "custom") return { ...prev, preset: value };
      const preset = FUND_PRESETS.find((p) => p.name === value);
      if (!preset) return { ...prev, preset: value };
      // Do not override monthly SIP or latest NAV - the user may want custom values.
      return {
        ...prev,
        preset: value,
        fundName: preset.name,
        feeRate: preset.feeRate.toString(),
      };
    });
  }

  async function handleSubmit() {
    if (!store) return;
    setFormError(null);

    const name = form.fundName.trim();
    const fee = parseFloat(form.feeRate);
    const sip = parseFloat(form.monthlySip);
    const nav = parseFloat(form.latestNav);

    // Mirrors the Zod schema in src/lib/schemas/fund-config.ts
    if (!name) return setFormError("Fund name is required");
    if (name.length > 100) return setFormError("Fund name is too long");
    if (isNaN(fee) || fee < 0) return setFormError("Fee rate cannot be negative");
    if (fee > 10) return setFormError("Fee rate seems too high - please verify");
    if (!form.startDate) return setFormError("Start date is required");
    if (isNaN(sip) || sip < MIN_SIP_AMOUNT)
      return setFormError(
        `Monthly SIP amount must be at least NPR ${MIN_SIP_AMOUNT.toLocaleString("en-IN")}`
      );
    if (isNaN(nav) || nav <= 0) return setFormError("Current NAV must be greater than 0");

    setIsLoading(true);
    // Same payload the onboarding sends: the registered schedule rides along
    // so the cloud fund carries it and the web reminder cron can use it.
    const scheduleFields = scheduleToFormFields(schedule);
    const input = {
      fund_name: name,
      fee_rate_pct: fee,
      start_date: form.startDate,
      monthly_sip: sip,
      latest_nav: nav,
      frequency:
        (scheduleFields.frequency as
          | "MONTHLY"
          | "QUARTERLY"
          | "SEMI_ANNUALLY"
          | "ANNUALLY"
          | null) || undefined,
      calendar_system:
        (scheduleFields.calendar_system as "AD" | "BS" | null) || undefined,
      anchor_date: scheduleFields.anchor_date || undefined,
      schedule_verified: scheduleFields.schedule_verified === "true",
    };

    const result = editingFund
      ? await store.updateFundConfig(editingFund.id, input)
      : await store.createFundConfig(input);

    if (result.success) {
      toast({
        title: editingFund ? "Fund updated" : "Fund added 🎉",
        description: `${name} settings saved successfully.`,
        variant: "success",
      });
      setOpen(false);
      onChanged?.();
    } else {
      setFormError(result.error ?? "Action failed");
      toast({
        title: "Action failed",
        description: result.error ?? "Something went wrong.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  }

  async function handleDelete(id: string) {
    if (!store) return;
    setIsLoading(true);
    const result = await store.deleteFundConfig(id);

    if (result.success) {
      toast({ title: "Fund removed", description: "Fund configuration deleted." });
      setDeletingId(null);
      onChanged?.();
    } else {
      toast({
        title: "Deletion blocked",
        description: result.error ?? "Could not delete this fund.",
        variant: "destructive",
      });
      setDeletingId(null);
    }
    setIsLoading(false);
  }

  // ---------- Render ----------

  return (
    <>
      <Card>
        <CardHeader
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <CardTitle style={{ fontSize: fontSize.xl, fontWeight: "900" }}>
              Fund Configurations
            </CardTitle>
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ marginTop: 4, fontSize: fontSize.sm }}
            >
              Manage your tracked mutual funds, fee percentages, and planned monthly SIP
              amounts.
            </Text>
          </View>
          <Button size="sm" onPress={openCreate}>
            <Plus size={15} color={colors.primaryForeground} strokeWidth={3} />
            <Text
              variant="label"
              color={colors.primaryForeground}
              style={{ fontSize: fontSize.base }}
            >
              Add Fund
            </Text>
          </Button>
        </CardHeader>

        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.sm }}>
          {/* Search - only once the list is long enough to need it */}
          {funds.length > 3 && (
            <Input
              placeholder="Search funds by name…"
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                setCurrentPage(1);
              }}
              rightSlot={<Search size={16} color={colors.mutedForeground} />}
            />
          )}

          {filteredFunds.length === 0 ? (
            <EmptyState
              title={funds.length === 0 ? "No funds yet" : "No funds match your search"}
              description={
                funds.length === 0
                  ? "Add your first mutual fund to start tracking SIP performance."
                  : "Try a different search term."
              }
              action={
                funds.length === 0 ? (
                  <Button size="sm" onPress={openCreate} style={{ marginTop: spacing.sm }}>
                    Add Fund
                  </Button>
                ) : undefined
              }
            />
          ) : (
            paginatedFunds.map((fund, idx) => {
              const accent = ROW_ACCENTS[idx % ROW_ACCENTS.length];
              return (
              <View
                key={fund.id}
                style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.xl,
                  backgroundColor: colors.card,
                  overflow: "hidden",
                }}
              >
                {/* Accent stripe */}
                <View
                  style={{
                    height: 4,
                    backgroundColor: accent.tint,
                  }}
                />
                <View style={{ padding: spacing.md, gap: spacing.md }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        height: 44,
                        width: 44,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: accent.bg,
                      }}
                    >
                      <Text
                        style={{ fontSize: fontSize.md, fontWeight: "900", color: accent.tint }}
                      >
                        {fundInitials(fund.fund_name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label" numberOfLines={2} style={{ fontWeight: "800" }}>
                        {fund.fund_name}
                      </Text>
                      <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
                        Since {formatDate(fund.start_date)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: spacing.xs }}>
                      <Pressable
                        onPress={() => openEdit(fund)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${fund.fund_name}`}
                        style={({ pressed }) => ({
                          height: 34,
                          width: 34,
                          borderRadius: radius.lg,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.muted,
                          opacity: pressed ? 0.65 : 1,
                        })}
                      >
                        <Pencil size={14} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        onPress={() => setDeletingId(fund.id)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${fund.fund_name}`}
                        style={({ pressed }) => ({
                          height: 34,
                          width: 34,
                          borderRadius: radius.lg,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: `${colors.destructive}14`,
                          opacity: pressed ? 0.65 : 1,
                        })}
                      >
                        <Trash2 size={14} color={colors.destructive} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Stat strip: fee · monthly SIP · latest NAV */}
                  <View
                    style={{
                      flexDirection: "row",
                      backgroundColor: colors.muted,
                      borderRadius: radius.lg,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      gap: spacing.sm,
                    }}
                  >
                    <FundStat
                      label="Fee"
                      value={`${fund.fee_rate_pct}%`}
                      color={accent.tint}
                    />
                    <View style={{ width: 1, backgroundColor: colors.border }} />
                    <FundStat
                      label="Monthly SIP"
                      value={formatCurrencyWhole(fund.monthly_sip)}
                      color={colors.foreground}
                    />
                    <View style={{ width: 1, backgroundColor: colors.border }} />
                    <FundStat
                      label="Latest NAV"
                      value={fund.latest_nav ? fund.latest_nav.toFixed(2) : ""}
                      color={colors.foreground}
                    />
                  </View>
                </View>
              </View>
              );
            })
          )}

          {/* Pagination */}
          {filteredFunds.length > ITEMS_PER_PAGE && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: spacing.xs,
                marginTop: spacing.sm,
              }}
            >
              <Pressable
                onPress={() => setCurrentPage(Math.max(1, validCurrentPage - 1))}
                disabled={validCurrentPage === 1}
                style={{
                  height: 34,
                  width: 34,
                  borderRadius: radius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: validCurrentPage === 1 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={16} color={colors.foreground} />
              </Pressable>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setCurrentPage(p)}
                  style={{
                    height: 34,
                    minWidth: 34,
                    paddingHorizontal: spacing.sm,
                    borderRadius: radius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: p === validCurrentPage ? colors.primary : "transparent",
                    borderWidth: 1,
                    borderColor: p === validCurrentPage ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    variant="caption"
                    color={p === validCurrentPage ? colors.primaryForeground : colors.foreground}
                    style={{ fontWeight: "800" }}
                  >
                    {p}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setCurrentPage(Math.min(totalPages, validCurrentPage + 1))}
                disabled={validCurrentPage === totalPages}
                style={{
                  height: 34,
                  width: 34,
                  borderRadius: radius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: validCurrentPage === totalPages ? 0.4 : 1,
                }}
              >
                <ChevronRight size={16} color={colors.foreground} />
              </Pressable>
            </View>
          )}
        </View>
      </Card>

      {/* ---------- Create / Edit sheet ---------- */}
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        position="bottom"
        title={editingFund ? "Edit Fund" : "Add Fund Config"}
        description="Configure annual fee %, planned monthly investment, and current market NAV."
        footer={
          <Button fullWidth size="lg" loading={isLoading} onPress={handleSubmit}>
            {editingFund ? "Save Changes" : "Add Fund"}
          </Button>
        }
      >
        <View style={{ gap: spacing.lg }}>
          <Select
            label="Preset Fund"
            value={form.preset}
            options={[
              ...FUND_PRESETS.map((p) => ({ value: p.name, label: p.name })),
              { value: "custom", label: "Custom / Other" },
            ]}
            onValueChange={applyPreset}
            placeholder="Choose a preset or select Custom"
          />

          <Input
            label="Fund Name"
            value={form.fundName}
            onChangeText={(t) => setForm((p) => ({ ...p, fundName: t }))}
            placeholder="e.g. NMB Saral Bachat Fund-E"
            autoCapitalize="words"
          />

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Input
              label="Annual Fee (%)"
              value={form.feeRate}
              onChangeText={(t) => setForm((p) => ({ ...p, feeRate: t }))}
              keyboardType="decimal-pad"
              placeholder="1.80"
              containerStyle={{ flex: 1 }}
            />

            <Input
              label="Current NAV (NPR)"
              value={form.latestNav}
              onChangeText={(t) => setForm((p) => ({ ...p, latestNav: t }))}
              keyboardType="decimal-pad"
              placeholder="e.g. 10.50"
              error={formError}
              containerStyle={{ flex: 1 }}
            />
          </View>

          <Input
            label={`Planned Monthly SIP (NPR) - minimum ${MIN_SIP_AMOUNT.toLocaleString("en-IN")}`}
            value={form.monthlySip}
            onChangeText={(t) => setForm((p) => ({ ...p, monthlySip: t }))}
            keyboardType="number-pad"
            placeholder="5000"
          />

          <DateField
            label="Start Date"
            value={form.startDate}
            onChange={(d) => {
              setForm((p) => ({ ...p, startDate: d }));
              // SIP start date mirrors the registration date unless the
              // user overrides it in the schedule section below.
              setSchedule((s) => ({ ...s, anchorDate: d || null, verified: false }));
            }}
          />

          {/* Section 2 - SIP schedule (same as the web fund settings page) */}
          <SIPScheduleFields
            fundName={form.fundName}
            value={schedule}
            onChange={setSchedule}
          />
        </View>
      </Modal>

      {/* ---------- Delete confirmation ---------- */}
      <Modal
        visible={!!deletingId}
        onClose={() => setDeletingId(null)}
        title="Delete Fund Configuration"
        description="Are you sure? Note: A fund with existing SIP entries cannot be deleted until all entries are deleted first."
        footer={
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => setDeletingId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              style={{ flex: 1 }}
              loading={isLoading}
              onPress={() => deletingId && handleDelete(deletingId)}
            >
              Delete Fund
            </Button>
          </View>
        }
      >
        <Text variant="caption" color={colors.mutedForeground}>
          This only removes the fund's configuration. Your SIP entry history for this fund
          must be deleted first - that guard protects your records.
        </Text>
      </Modal>
    </>
  );
}
