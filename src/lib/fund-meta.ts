// ============================================================
// SahakariSIP — Central Fund Metadata (single source of truth)
// ============================================================
// Ported from web app (src/lib/fund-meta.ts).
//
// Fund RULES (what a fund officially supports) live ONLY here.
// User registration data lives in fund_config rows. Actual
// transactions live in entries. Never mix the layers.
//
// Every value below was verified against the linked official
// fund-manager source on the recorded date. An unknown fund name
// is INCOMPLETE on purpose - there is no permissive default.
// ============================================================

import type { SIPFrequency, CalendarSystem } from "./calendar/bs";

export interface FundSource {
  url: string;
  confirms: string;
}

export interface FundMeta {
  /** Stable internal id. */
  id: string;
  /** Must match the fund_name stored on a fund_config row. */
  name: string;
  fundManager: string;
  minimumSipAmount: number;
  supportedFrequencies: SIPFrequency[];
  supportedCalendarSystems: CalendarSystem[];
  unlimitedSipSupported: boolean;
  officialSources: FundSource[];
  /** ISO date the sources above were last verified. */
  lastVerifiedAt: string;
}

export const FUND_META: Record<string, FundMeta> = {
  "NMB Saral Bachat Fund-E": {
    id: "nmb-saral-bachat-e",
    name: "NMB Saral Bachat Fund-E",
    fundManager: "NMB Capital",
    minimumSipAmount: 1000,
    supportedFrequencies: ["MONTHLY", "QUARTERLY"],
    supportedCalendarSystems: ["AD", "BS"],
    unlimitedSipSupported: true,
    officialSources: [
      {
        url: "https://www.nmbcl.com.np/services/mutual-fund/scheme/nmb-saral-bachat-fund-e",
        confirms: "Scheme page; SIP interval options shown in official portal",
      },
      {
        url: "https://mutualfund.nmbcl.com.np:8445",
        confirms: "Official SIP Registration portal: SIP Interval = Monthly | Quarterly; Model of SIP selector",
      },
    ],
    lastVerifiedAt: "2026-09-23",
  },
  "NIBL Sahabhagita Fund": {
    id: "nibl-sahabhagita",
    name: "NIBL Sahabhagita Fund",
    fundManager: "NIMB Ace Capital",
    minimumSipAmount: 1000,
    supportedFrequencies: ["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"],
    supportedCalendarSystems: ["AD", "BS"],
    unlimitedSipSupported: true,
    officialSources: [
      {
        url: "https://www.nimbacecapital.com/wp-content/uploads/2021/03/Form_SIP-Registration_Revised.pdf",
        confirms: "SIP Interval: Monthly / Quarterly / Semi-Annually / Annually; SIP Start Date field; NPR 1,000 minimum",
      },
      {
        url: "https://mutualfund.nimbacecapital.com/File/Downloads/Form_SIP-Ammendment.pdf",
        confirms: "Model of SIP: Unlimited Installments; explicit SIP Due Date field; all four intervals",
      },
      {
        url: "https://mutualfund.nimbacecapital.com/PG/FAQs",
        confirms: "No fee for late/advance payment; cancellation needs 7 days notice before SIP date",
      },
    ],
    lastVerifiedAt: "2026-09-23",
  },
  SSIS: {
    id: "ssis",
    name: "SSIS",
    fundManager: "Siddhartha Capital Limited",
    minimumSipAmount: 1000,
    supportedFrequencies: ["MONTHLY", "QUARTERLY"],
    supportedCalendarSystems: ["AD", "BS"],
    unlimitedSipSupported: true,
    officialSources: [
      {
        url: "https://www.siddharthacapital.com/wp-content/uploads/2024/03/final-sip-amendment-form.pdf",
        confirms: "SIP Frequency (Interval): Monthly / Quarterly; explicit SIP Due Date field",
      },
      {
        url: "https://www.siddharthacapital.com/ssis-faq/",
        confirms: "Minimum NPR 1,000; amount and date customizable via Amendment Form; open-ended duration",
      },
      {
        url: "https://mutualfund.siddharthacapital.com/Modules/EMandate/E_Mandate_Register.aspx",
        confirms: "Official portal: SIP Interval = Monthly | Quarterly",
      },
      {
        url: "https://www.siddharthacapital.com/ssis-faq/",
        confirms:
          "Auto-debit available: Siddhartha Bank account/mobile banking via Standing Instruction; other ConnectIPS banks via e-mandate. Bank confirmation (2026-09-24): installments repeat the initial payment date on the BS calendar.",
      },
    ],
    lastVerifiedAt: "2026-09-24",
  },
};

/**
 * Look up fund metadata by stored fund_name. Returns null for anything not
 * officially verified - callers must treat null as "schedule incomplete",
 * never as "assume monthly/1000".
 */
export function getFundMeta(fundName: string): FundMeta | null {
  return FUND_META[fundName] ?? null;
}

export function isFrequencySupported(fundName: string, freq: SIPFrequency): boolean {
  const meta = getFundMeta(fundName);
  return meta ? meta.supportedFrequencies.includes(freq) : false;
}