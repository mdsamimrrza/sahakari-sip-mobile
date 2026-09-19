// ============================================================
// SahakariSIP — Fund Config Zod Schema
// ============================================================
// Ported verbatim from the web app (src/lib/schemas/fund-config.ts).
// ============================================================

import { z } from "zod";
import { MIN_SIP_AMOUNT } from "../constants";

export const fundConfigSchema = z.object({
  fund_name: z
    .string()
    .min(1, "Fund name is required")
    .max(100, "Fund name is too long"),
  fee_rate_pct: z
    .number()
    .finite("Fee rate must be a finite number")
    .min(0, "Fee rate cannot be negative")
    .max(10, "Fee rate seems too high — please verify"),
  start_date: z.coerce.date({
    required_error: "Start date is required",
    invalid_type_error: "Please enter a valid date",
  }),
  monthly_sip: z
    .number()
    .finite("Monthly SIP amount must be a finite number")
    .min(
      MIN_SIP_AMOUNT,
      `Monthly SIP amount must be at least NPR ${MIN_SIP_AMOUNT.toLocaleString("en-IN")}`
    ),
  latest_nav: z
    .number({ required_error: "Current NAV is required" })
    .finite("Current NAV must be a finite number")
    .positive("Current NAV must be greater than 0"),
});

export type FundConfigFormValues = z.infer<typeof fundConfigSchema>;

export const updateLatestNavSchema = z.object({
  fund_id: z.string().uuid("Invalid fund ID"),
  latest_nav: z.number().finite("NAV must be a finite number").positive("NAV must be greater than 0"),
  latest_nav_date: z.coerce.date({
    required_error: "Date is required",
    invalid_type_error: "Please enter a valid date",
  }),
});

export type UpdateLatestNavValues = z.infer<typeof updateLatestNavSchema>;
