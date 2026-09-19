// ============================================================
// SahakariSIP — Add / Edit SIP entry
// ============================================================
// Port of the web app's components/entries/entry-form.tsx.
//
// The Nepal-specific accounting is the important part:
//   Effective Cash = max(0, (Deposit + Carried Rollover) − 5)
//   Whole Units    = floor(Effective Cash / NAV)      ← SEBON rule
//   Leftover       = Effective Cash − (Units × NAV)   → Rollover Wallet
// The live breakdown preview shows every step before saving.
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { DP_CHARGE } from "@/lib/constants";
import { todayKey } from "@/lib/format";
import { entrySchema } from "@/lib/schemas/entry";
import type { Entry, FundConfig } from "@/lib/types";
import { useTheme, radius, spacing } from "@/theme";
import {
  Text,
  Button,
  Input,
  Checkbox,
  Separator,
} from "@/components/ui/primitives";
import { Modal, Select, useToast } from "@/components/ui/overlays";
import { DateField } from "@/components/ui/DateField";

export function EntryFormModal({
  visible,
  onClose,
  funds,
  entry,
  defaultFundId,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  funds: FundConfig[];
  entry?: Entry | null;
  defaultFundId?: string;
  onSaved?: () => void;
}) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const isEdit = !!entry;

  const [fundId, setFundId] = useState(
    entry?.fund_id ?? defaultFundId ?? funds[0]?.id ?? ""
  );
  const [purchaseDate, setPurchaseDate] = useState(
    entry?.purchase_date ?? todayKey()
  );
  const [amount, setAmount] = useState(entry?.amount?.toString() ?? "");
  const [nav, setNav] = useState(entry?.nav?.toString() ?? "");
  const [units, setUnits] = useState(entry?.units?.toString() ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [overrideUnits, setOverrideUnits] = useState(false);
  const [deductDpCharge, setDeductDpCharge] = useState(true);
  const [useWholeUnits, setUseWholeUnits] = useState(true);
  const [carriedRollover, setCarriedRollover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFund = funds.find((f) => f.id === fundId);

  // Reset the form each time the sheet opens
  useEffect(() => {
    if (!visible) return;
    setFundId(entry?.fund_id ?? defaultFundId ?? funds[0]?.id ?? "");
    setPurchaseDate(entry?.purchase_date ?? todayKey());
    setAmount(entry?.amount?.toString() ?? "");
    setNav(entry?.nav?.toString() ?? "");
    setUnits(entry?.units?.toString() ?? "");
    setNotes(entry?.notes ?? "");
    setOverrideUnits(false);
    setDeductDpCharge(true);
    setUseWholeUnits(true);
    setError(null);
  }, [visible, entry, defaultFundId, funds]);

  // Fetch carried-forward rollover cash when the sheet opens or the fund changes
  useEffect(() => {
    if (!visible || !fundId || isEdit || !store) return;
    let active = true;
    (async () => {
      const res = await store.getFundRolloverCash(fundId);
      if (active && res.success && typeof res.data === "number") {
        setCarriedRollover(res.data);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible, fundId, isEdit, store]);

  // Auto-calculate whole units (integer only)
  useEffect(() => {
    if (overrideUnits) return;
    const a = parseFloat(amount);
    const n = parseFloat(nav);
    if (!(a > 0) || !(n > 0)) return;

    const totalAvail = a + (isEdit ? 0 : carriedRollover);
    const effectiveAmount = deductDpCharge
      ? Math.max(0, totalAvail - DP_CHARGE)
      : totalAvail;
    const computed = useWholeUnits
      ? Math.floor(effectiveAmount / n)
      : effectiveAmount / n;

    setUnits(useWholeUnits ? computed.toString() : computed.toFixed(4));
  }, [amount, nav, overrideUnits, deductDpCharge, useWholeUnits, carriedRollover, isEdit]);

  // Live breakdown numbers
  const preview = useMemo(() => {
    const a = parseFloat(amount) || 0;
    const n = parseFloat(nav) || 0;
    const u = parseFloat(units) || 0;
    const carried = isEdit ? 0 : carriedRollover;
    const totalAvailable = a + carried;
    const dpFee = deductDpCharge ? DP_CHARGE : 0;
    const netCash = Math.max(0, totalAvailable - dpFee);
    const unitCost = u * n;
    const leftover = Math.max(0, netCash - unitCost);
    return { a, n, u, carried, totalAvailable, dpFee, netCash, unitCost, leftover };
  }, [amount, nav, units, deductDpCharge, carriedRollover, isEdit]);

  const showPreview = preview.a > 0 && preview.n > 0;

  async function handleSave() {
    if (!store) return;
    setError(null);

    const payload = {
      fund_id: fundId,
      purchase_date: new Date(purchaseDate),
      amount: parseFloat(amount),
      nav: parseFloat(nav),
      units: parseFloat(units),
      notes: notes || undefined,
    };

    const parsed = entrySchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    // Date guard mirrors the server action
    if (activeFund && purchaseDate < activeFund.start_date) {
      setError(
        `Purchase date cannot be before the fund's start date (${activeFund.start_date})`
      );
      return;
    }

    setSaving(true);
    const res = isEdit
      ? await store.updateEntry(entry!.id, {
          fund_id: fundId,
          purchase_date: purchaseDate,
          amount: payload.amount,
          nav: payload.nav,
          units: payload.units,
          notes: notes || null,
        })
      : await store.createEntry({
          fund_id: fundId,
          purchase_date: purchaseDate,
          amount: payload.amount,
          nav: payload.nav,
          units: payload.units,
          notes: notes || null,
        });
    setSaving(false);

    if (res.success) {
      toast({
        title: isEdit ? "Entry updated" : "Entry added! 🎉",
        description: isEdit
          ? "Your SIP entry has been updated."
          : "Dashboard has been recalculated.",
        variant: "success",
      });
      onSaved?.();
      onClose();
    } else {
      setError(res.error ?? "Failed to save the entry.");
      toast({
        title: isEdit ? "Update failed" : "Failed to add entry",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={isEdit ? "Edit SIP Entry" : "Add SIP Entry"}
      description={
        isEdit
          ? "Update the details of this entry."
          : "Record this month's SIP purchase."
      }
      position="bottom"
      footer={
        <View style={{ gap: spacing.sm }}>
          {error ? (
            <Text variant="caption" color={colors.destructive}>
              {error}
            </Text>
          ) : null}
          <Button fullWidth size="lg" loading={saving} onPress={handleSave}>
            {isEdit ? "Update Entry" : "Add Entry"}
          </Button>
        </View>
      }
    >
      <View style={{ gap: spacing.lg }}>
        {funds.length > 1 && (
          <Select
            label="Fund"
            value={fundId}
            onValueChange={setFundId}
            options={funds.map((f) => ({ value: f.id, label: f.fund_name }))}
          />
        )}

        <DateField
          label="Purchase Date"
          value={purchaseDate}
          onChange={setPurchaseDate}
          maxDate={todayKey()}
          minDate={activeFund?.start_date}
        />

        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Input
            label="Amount (NPR)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="e.g. 5000"
            containerStyle={{ flex: 1 }}
          />

          <Input
            label="NAV at Purchase"
            value={nav}
            onChangeText={setNav}
            keyboardType="decimal-pad"
            placeholder="e.g. 13.25"
            containerStyle={{ flex: 1 }}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              variant="caption"
              color={colors.mutedForeground}
              style={{ fontWeight: "600" }}
            >
              Units Received
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setOverrideUnits((v) => !v)}
            >
              <Text variant="caption" color={colors.primary} style={{ fontWeight: "700" }}>
                {overrideUnits ? "Auto-calculate" : "Override manually"}
              </Text>
            </Button>
          </View>

          <Input
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
            placeholder="Auto-calculated"
            editable={overrideUnits}
            style={{ fontWeight: "700" }}
          />

          {!overrideUnits && (
            <View
              style={{
                backgroundColor: `${colors.success}0A`,
                borderRadius: radius.lg,
                padding: spacing.md,
                gap: spacing.sm,
              }}
            >
              <Checkbox
                checked={deductDpCharge}
                onToggle={setDeductDpCharge}
                label={`Deduct Rs ${DP_CHARGE} DP Charge`}
              />
              <Checkbox
                checked={useWholeUnits}
                onToggle={setUseWholeUnits}
                label="Whole Units (Nepal SIP)"
              />

              {showPreview && (
                <View style={{ gap: 4, marginTop: spacing.sm }}>
                  <Separator />
                  <PreviewRow
                    label="Fresh Deposit Added"
                    value={`NPR ${preview.a.toFixed(2)}`}
                  />
                  {!isEdit && preview.carried > 0 && (
                    <PreviewRow
                      label="+ Carried-Forward Cash"
                      value={`NPR ${preview.carried.toFixed(2)}`}
                      color={colors.blue}
                    />
                  )}
                  <PreviewRow
                    label="Total Available Cash"
                    value={`NPR ${preview.totalAvailable.toFixed(2)}`}
                    emphasis
                  />
                  <PreviewRow
                    label="− DP Charge Deducted"
                    value={`NPR ${preview.dpFee.toFixed(2)}`}
                  />
                  <PreviewRow
                    label="Net Allotment Cash"
                    value={`NPR ${preview.netCash.toFixed(2)}`}
                    emphasis
                  />
                  <PreviewRow
                    label={`− Unit Cost (${preview.u || 0} units @ ${preview.n})`}
                    value={`NPR ${preview.unitCost.toFixed(2)}`}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: spacing.sm,
                      backgroundColor: `${colors.success}14`,
                      borderRadius: radius.md,
                      padding: spacing.sm,
                      marginTop: 4,
                    }}
                  >
                    <Text variant="caption" color={colors.success} style={{ fontWeight: "700" }}>
                      New Leftover Rollover
                    </Text>
                    <Text variant="caption" color={colors.success} style={{ fontWeight: "800" }} tabular>
                      NPR {preview.leftover.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder='e.g. "step-up applied this month"'
          maxLength={500}
        />
      </View>
    </Modal>
  );
}

function PreviewRow({
  label,
  value,
  color,
  emphasis,
}: {
  label: string;
  value: string;
  color?: string;
  emphasis?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
      }}
    >
      <Text
        variant="caption"
        color={emphasis ? colors.foreground : colors.mutedForeground}
        style={{ fontWeight: emphasis ? "700" : "500", flex: 1 }}
      >
        {label}
      </Text>
      <Text
        variant="caption"
        color={color ?? colors.foreground}
        style={{ fontWeight: emphasis ? "800" : "600" }}
        tabular
      >
        {value}
      </Text>
    </View>
  );
}
