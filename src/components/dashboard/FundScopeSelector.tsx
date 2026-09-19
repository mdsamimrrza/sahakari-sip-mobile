// ============================================================
// SahakariSIP — Fund scope selector
// ============================================================
// The web app scopes the dashboard via a `?fund=<id>` query param driven
// by a Select. On mobile this renders the same thing as a field whose
// options open in an anchored dropdown just below it (All Funds + every
// configured fund), shown on every screen that scopes by fund.
// ============================================================

import React from "react";
import { DropdownSelect } from "../ui/overlays";
import { formatFundShortName } from "../../lib/utils";
import type { FundConfig } from "../../lib/types";
import type { StyleProp, ViewStyle } from "react-native";

export function FundScopeSelector({
  funds,
  selectedFundId,
  onChange,
  style,
}: {
  funds: FundConfig[];
  selectedFundId: string;
  onChange: (fundId: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const options = [
    { value: "all", label: "All Funds" },
    ...funds.map((f) => ({ value: f.id, label: formatFundShortName(f.fund_name) })),
  ];

  const selected = funds.find((f) => f.id === selectedFundId);

  return (
    <DropdownSelect
      value={selectedFundId}
      options={options}
      onValueChange={onChange}
      displayValue={
        selected ? formatFundShortName(selected.fund_name) : "All Funds"
      }
      containerStyle={style}
    />
  );
}
