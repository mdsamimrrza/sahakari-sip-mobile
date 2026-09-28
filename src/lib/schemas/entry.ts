// ============================================================
// SahakariSIP — Entry Zod Schema
// ============================================================
// Ported verbatim from the web app (src/lib/schemas/entry.ts).
// ============================================================

import { z } from "zod";
import { MAX_NOTES_LENGTH, DP_CHARGE } from "../constants";

export const entrySchema = z.object({
  fund_id: z.string().uuid("Please select a fund"),
  purchase_date: z.coerce
    .date({
      required_error: "Purchase date is required",
      invalid_type_error: "Please enter a valid date",
    })
    .refine(
      (date) => date <= new Date(),
      "Purchase date cannot be in the future"
    ),
  amount: z
    .number({
      required_error: "Amount is required",
      invalid_type_error: "Amount must be a number",
    })
    .finite("Amount must be a finite number")
    .positive("Amount must be greater than 0"),
  nav: z
    .number({
      required_error: "NAV is required",
      invalid_type_error: "NAV must be a number",
    })
    .finite("NAV must be a finite number")
    .positive("NAV must be greater than 0"),
  units: z
    .number({
      required_error: "Units are required",
      invalid_type_error: "Units must be a number",
    })
    .finite("Units must be a finite number")
    .positive("Units must be greater than 0"),
  notes: z
    .string()
    .max(MAX_NOTES_LENGTH, `Notes cannot exceed ${MAX_NOTES_LENGTH} characters`)
    .nullable()
    .optional()
    .or(z.literal("")),
});

export type EntryFormValues = z.infer<typeof entrySchema>;

// CSV import row schema — units and notes are optional
export const csvRowSchema = z.object({
  date: z.string().refine((val) => {
    const d = new Date(val);
    return !isNaN(d.getTime()) && d <= new Date();
  }, "Invalid or future date"),
  amount: z.coerce.number().finite("Amount must be a finite number").positive("Amount must be greater than 0"),
  nav: z.coerce.number().finite("NAV must be a finite number").positive("NAV must be greater than 0"),
  units: z.coerce.number().finite("Units must be a finite number").positive("Units must be greater than 0").optional(),
  notes: z.string().max(MAX_NOTES_LENGTH).optional(),
}).refine(
  (data) => {
    if (data.units === undefined) return true;
    const effectiveCash = Math.max(0, data.amount - DP_CHARGE);
    const expectedUnits = Math.floor(effectiveCash / data.nav);
    return data.units === expectedUnits;
  },
  {
    message: `Units must equal floor((amount - ${DP_CHARGE}) / nav) per SEBON whole-unit rule`,
    path: ["units"],
  }
);

export type CsvRowData = z.infer<typeof csvRowSchema>;
