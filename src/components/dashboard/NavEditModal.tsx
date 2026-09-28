// ============================================================
// SahakariSIP — Edit NAV modal
// ============================================================
// Opened from the dashboard's + menu. Lets the user pick a fund
// and set its latest NAV (stamped with today's date), writing
// through the same updateLatestNav path as everywhere else.
// ============================================================

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { todayKey } from "@/lib/format";
import { formatFundShortName } from "@/lib/utils";
import { useTheme, spacing } from "@/theme";
import { Text, Input, Button } from "@/components/ui/primitives";
import { Modal, Select, useToast } from "@/components/ui/overlays";
import type { FundConfig } from "@/lib/types";

export function NavEditModal({
  visible,
  onClose,
  funds,
  defaultFundId,
  onUpdated,
}: {
  visible: boolean;
  onClose: () => void;
  funds: FundConfig[];
  defaultFundId?: string;
  onUpdated?: () => void;
}) {
  const { store } = useAuth();
  const { toast } = useToast();
  const { colors } = useTheme();

  const [fundId, setFundId] = useState(defaultFundId || funds[0]?.id || "");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    const id = defaultFundId || funds[0]?.id || "";
    setFundId(id);
    const fund = funds.find((f) => f.id === id);
    setValue(fund?.latest_nav ? String(Number(fund.latest_nav)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Pre-fill from the selected fund when switching funds.
  useEffect(() => {
    const fund = funds.find((f) => f.id === fundId);
    setValue(fund?.latest_nav ? String(Number(fund.latest_nav)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  async function handleSave() {
    if (!store || !fundId) return;
    const nav = parseFloat(value);
    if (!nav || nav <= 0) {
      toast({
        title: "Invalid NAV",
        description: "Enter a NAV greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const res = await store.updateLatestNav({
      fund_id: fundId,
      latest_nav: nav,
      latest_nav_date: todayKey(),
    });
    setSaving(false);

    if (res.success) {
      toast({
        title: "NAV updated",
        description: "Dashboard values have been recalculated.",
        variant: "success",
      });
      onUpdated?.();
      onClose();
    } else {
      toast({
        title: "Failed to update NAV",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Edit NAV"
      description="Set the latest NAV for a fund. Saved with today's date."
      position="bottom"
      footer={
        <Button fullWidth size="lg" loading={saving} onPress={handleSave}>
          Save NAV
        </Button>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Select
          label="Fund"
          value={fundId}
          options={funds.map((f) => ({
            value: f.id,
            label: formatFundShortName(f.fund_name),
          }))}
          onValueChange={setFundId}
        />
        <Input
          label="Latest NAV (NPR)"
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="e.g. 10.14"
        />
        <Text variant="caption" color={colors.mutedForeground}>
          The auto-fetch fills this nightly — edit only if you want to
          override it manually.
        </Text>
      </View>
    </Modal>
  );
}
