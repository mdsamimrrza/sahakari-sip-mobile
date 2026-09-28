// ============================================================
// SahakariSIP — Data Store Contract
// ============================================================
// The web app talks to Postgres through Next.js server actions
// (src/lib/actions/*). The mobile app can't run those server actions,
// so every action is re-expressed here as a single interface that two
// adapters implement:
//
//   • cloudStore  → Supabase (same project, same tables, same RLS)
//   • localStore  → on-device storage (works fully offline)
//
// Screens depend only on this contract, so switching backends changes
// nothing about the UI or the business rules.
// ============================================================

import type {
  ActionResult,
  CsvImportResult,
  DashboardData,
  Entry,
  FundConfig,
  NavHistoryRow,
  NotificationItem,
  NotificationPreferences,
} from "../types";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DataMode = "local" | "cloud";

// ---------- Persisted mode choice ----------
// The user's Cloud-vs-Local choice on the auth screens persists here so it
// survives navigation between login/signup (each screen restores the same
// value instead of re-defaulting) and app restarts. Cloud stays the default
// whenever nothing has been chosen yet.
const DATA_MODE_KEY = "sahakarisip.v1.data_mode";

export async function loadSavedDataMode(): Promise<DataMode | null> {
  try {
    const raw = await AsyncStorage.getItem(DATA_MODE_KEY);
    return raw === "cloud" || raw === "local" ? raw : null;
  } catch {
    return null;
  }
}

export async function saveDataMode(mode: DataMode): Promise<void> {
  try {
    await AsyncStorage.setItem(DATA_MODE_KEY, mode);
  } catch {
    // Best-effort - the default rule still applies.
  }
}

// ---------- Input payloads (the mobile equivalent of FormData) ----------

export interface EntryInput {
  fund_id: string;
  purchase_date: string; // "YYYY-MM-DD"
  amount: number;
  nav: number;
  units: number;
  notes?: string | null;
}

export interface FundConfigInput {
  fund_name: string;
  fee_rate_pct: number;
  start_date: string; // "YYYY-MM-DD"
  monthly_sip: number;
  latest_nav: number;
  frequency?: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY" | null;
  calendar_system?: "AD" | "BS" | null;
  anchor_date?: string | null;
  schedule_verified?: boolean;
}

export interface LatestNavInput {
  fund_id: string;
  latest_nav: number;
  latest_nav_date: string; // "YYYY-MM-DD"
}

export interface CsvImportRow {
  date: string;
  amount: number;
  nav: number;
  units?: number;
  notes?: string;
}

export interface GetEntriesParams {
  fundId?: string;
  page?: number;
  pageSize?: number;
  sortOrder?: "asc" | "desc";
}

// ---------- Profile ----------

export interface ProfileImageResult {
  image: string | null;
}

export interface DataStore {
  readonly mode: DataMode;

  /** Stable identifier for the signed-in principal (local device id or Supabase uid). */
  getUserId(): Promise<string | null>;

  // ---------- Dashboard ----------
  getDashboardData(fundId?: string): Promise<ActionResult<DashboardData>>;

  // ---------- Fund config ----------
  getFundConfigs(): Promise<ActionResult<FundConfig[]>>;
  createFundConfig(input: FundConfigInput): Promise<ActionResult<FundConfig>>;
  updateFundConfig(
    id: string,
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>>;
  deleteFundConfig(id: string): Promise<ActionResult>;
  updateLatestNav(input: LatestNavInput): Promise<ActionResult>;

  /** Device-mode only: pull the public NAV feed (throttled, opt-out). */
  syncNavFeed?(): Promise<void>;

  // ---------- Entries ----------
  getEntries(
    params?: GetEntriesParams
  ): Promise<ActionResult<{ entries: Entry[]; total: number }>>;
  createEntry(input: EntryInput): Promise<ActionResult<Entry>>;
  updateEntry(id: string, input: EntryInput): Promise<ActionResult<Entry>>;
  deleteEntry(id: string): Promise<ActionResult>;
  importEntriesFromCsv(
    fundId: string,
    rows: CsvImportRow[]
  ): Promise<ActionResult<CsvImportResult>>;
  getFundRolloverCash(fundId: string): Promise<ActionResult<number>>;

  // ---------- NAV history ----------
  getNavHistory(fundId?: string): Promise<NavHistoryRow[]>;

  // ---------- Notification preferences ----------
  getNotificationPreferences(): Promise<NotificationPreferences>;
  saveNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<ActionResult>;

  // ---------- Notifications log (bell) ----------
  getNotifications(): Promise<ActionResult<NotificationItem[]>>;
  markNotificationRead(id: string): Promise<ActionResult>;
  markAllNotificationsRead(): Promise<ActionResult>;

  // ---------- Profile ----------
  getProfile(): Promise<ActionResult<{ name: string | null; image: string | null; email: string | null }>>;
  updateProfileImage(uri: string, mimeType: string): Promise<ActionResult<ProfileImageResult>>;
  removeProfileImage(): Promise<ActionResult<ProfileImageResult>>;

  // ---------- Account ----------
  deleteAllUserData(): Promise<ActionResult>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  email_enabled: true,
  reminder_day: 1,
  notify_days_before: 2,
};
