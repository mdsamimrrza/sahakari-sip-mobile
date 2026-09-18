// ============================================================
// SahakariSIP — On-Device Data Store (offline mode)
// ============================================================
// Implements the exact business rules of the web app's server actions
// (src/lib/actions/entries.ts, fund-config.ts, dashboard.ts) against
// local device storage instead of Postgres:
//
//   • SEBON whole-unit allotment  (Math.floor)
//   • NPR 5 DP charge per transaction
//   • SIP Rollover Wallet carry-forward
//   • nav_history upsert on (fund_id, nav_date)
//   • latest_nav auto-advance only when the new entry is newer
//   • fund deletion blocked while entries exist
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { DP_CHARGE } from "../constants";
import { csvRowSchema, entrySchema } from "../schemas/entry";
import { fundConfigSchema, updateLatestNavSchema } from "../schemas/fund-config";
import { computeDashboardData, computeFundRolloverCash } from "./analytics";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type CsvImportRow,
  type DataStore,
  type EntryInput,
  type FundConfigInput,
  type GetEntriesParams,
  type LatestNavInput,
} from "./store";
import { todayKey } from "../format";
import { uuid } from "../utils";

const NS = "sahakarisip.v1";

const key = {
  funds: (uid: string) => `${NS}.${uid}.funds`,
  entries: (uid: string) => `${NS}.${uid}.entries`,
  nav: (uid: string) => `${NS}.${uid}.nav_history`,
  prefs: (uid: string) => `${NS}.${uid}.prefs`,
  notifications: (uid: string) => `${NS}.${uid}.notifications`,
};

async function readJson<T>(k: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(k);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(k: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(k, JSON.stringify(value));
}

export class LocalStore implements DataStore {
  readonly mode = "local" as const;

  constructor(private readonly userId: string) {}

  async getUserId(): Promise<string | null> {
    return this.userId;
  }

  // ------------------------------------------------------------
  // Internal readers
  // ------------------------------------------------------------

  private async funds(): Promise<FundConfig[]> {
    return readJson<FundConfig[]>(key.funds(this.userId), []);
  }

  private async entries(): Promise<Entry[]> {
    return readJson<Entry[]>(key.entries(this.userId), []);
  }

  private async navRows(): Promise<NavHistoryRow[]> {
    return readJson<NavHistoryRow[]>(key.nav(this.userId), []);
  }

  private async setFunds(funds: FundConfig[]): Promise<void> {
    await writeJson(key.funds(this.userId), funds);
  }

  private async setEntries(entries: Entry[]): Promise<void> {
    await writeJson(key.entries(this.userId), entries);
  }

  private async setNavRows(rows: NavHistoryRow[]): Promise<void> {
    await writeJson(key.nav(this.userId), rows);
  }

  /** Upsert into nav_history keyed by (fund_id, nav_date) — matches Postgres. */
  private async upsertNav(
    fundId: string,
    navDate: string,
    navValue: number
  ): Promise<void> {
    const rows = await this.navRows();
    const idx = rows.findIndex(
      (r) => r.fund_id === fundId && r.nav_date === navDate
    );
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], nav_value: navValue };
    } else {
      rows.push({
        id: uuid(),
        user_id: this.userId,
        fund_id: fundId,
        nav_date: navDate,
        nav_value: navValue,
        created_at: new Date().toISOString(),
      });
    }
    await this.setNavRows(rows);
  }

  // ------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------

  async getDashboardData(
    fundId = "all"
  ): Promise<ActionResult<DashboardData>> {
    const funds = (await this.funds()).filter((f) => f.is_active !== false);
    const allEntries = await this.entries();
    const entries =
      fundId && fundId !== "all"
        ? allEntries.filter((e) => e.fund_id === fundId)
        : allEntries;

    const sorted = [...entries].sort((a, b) =>
      a.purchase_date.localeCompare(b.purchase_date)
    );

    const navHistory = (await this.navRows()).filter(
      (r) => !fundId || fundId === "all" || r.fund_id === fundId
    );

    return {
      success: true,
      data: computeDashboardData({
        funds,
        entries: sorted,
        navHistory,
        fundId,
      }),
    };
  }

  // ------------------------------------------------------------
  // Fund config
  // ------------------------------------------------------------

  async getFundConfigs(): Promise<ActionResult<FundConfig[]>> {
    const funds = (await this.funds())
      .filter((f) => f.is_active !== false)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { success: true, data: funds };
  }

  async createFundConfig(
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>> {
    const parsed = fundConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const now = new Date().toISOString();
    const fund: FundConfig = {
      id: uuid(),
      user_id: this.userId,
      fund_name: parsed.data.fund_name,
      fee_rate_pct: parsed.data.fee_rate_pct,
      start_date: input.start_date,
      monthly_sip: parsed.data.monthly_sip,
      latest_nav: parsed.data.latest_nav,
      latest_nav_date: input.start_date,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    const funds = await this.funds();
    funds.push(fund);
    await this.setFunds(funds);

    await this.upsertNav(fund.id, input.start_date, parsed.data.latest_nav);

    return { success: true, data: fund };
  }

  async updateFundConfig(
    id: string,
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>> {
    const parsed = fundConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const funds = await this.funds();
    const idx = funds.findIndex((f) => f.id === id);
    if (idx < 0) return { success: false, error: "Fund not found" };

    const existing = funds[idx];
    const navChanged = Number(existing.latest_nav) !== parsed.data.latest_nav;
    const newNavDate = navChanged
      ? todayKey()
      : existing.latest_nav_date ?? input.start_date;

    funds[idx] = {
      ...existing,
      fund_name: parsed.data.fund_name,
      fee_rate_pct: parsed.data.fee_rate_pct,
      start_date: input.start_date,
      monthly_sip: parsed.data.monthly_sip,
      latest_nav: parsed.data.latest_nav,
      latest_nav_date: newNavDate,
      updated_at: new Date().toISOString(),
    };
    await this.setFunds(funds);

    if (navChanged) {
      await this.upsertNav(id, newNavDate, parsed.data.latest_nav);
    }

    return { success: true, data: funds[idx] };
  }

  async deleteFundConfig(id: string): Promise<ActionResult> {
    const entries = await this.entries();
    const count = entries.filter((e) => e.fund_id === id).length;

    if (count > 0) {
      return {
        success: false,
        error: `This fund has ${count} ${
          count === 1 ? "entry" : "entries"
        }. Please delete all entries for this fund first.`,
      };
    }

    const funds = await this.funds();
    const next = funds.filter((f) => f.id !== id);
    if (next.length === funds.length) {
      return { success: false, error: "Fund not found" };
    }
    await this.setFunds(next);

    // Cascade nav_history (Postgres does this via ON DELETE CASCADE)
    const rows = await this.navRows();
    await this.setNavRows(rows.filter((r) => r.fund_id !== id));

    return { success: true };
  }

  async updateLatestNav(input: LatestNavInput): Promise<ActionResult> {
    const parsed = updateLatestNavSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const funds = await this.funds();
    const idx = funds.findIndex((f) => f.id === input.fund_id);
    if (idx < 0) return { success: false, error: "Fund not found" };

    funds[idx] = {
      ...funds[idx],
      latest_nav: parsed.data.latest_nav,
      latest_nav_date: input.latest_nav_date,
      updated_at: new Date().toISOString(),
    };
    await this.setFunds(funds);

    await this.upsertNav(
      input.fund_id,
      input.latest_nav_date,
      parsed.data.latest_nav
    );

    return { success: true };
  }

  // ------------------------------------------------------------
  // Entries
  // ------------------------------------------------------------

  async getEntries(
    params: GetEntriesParams = {}
  ): Promise<ActionResult<{ entries: Entry[]; total: number }>> {
    const { fundId, page = 1, pageSize = 20, sortOrder = "desc" } = params;

    let list = await this.entries();
    if (fundId) list = list.filter((e) => e.fund_id === fundId);

    list.sort((a, b) =>
      sortOrder === "asc"
        ? a.purchase_date.localeCompare(b.purchase_date)
        : b.purchase_date.localeCompare(a.purchase_date)
    );

    const total = list.length;
    const start = (page - 1) * pageSize;
    const paged = list.slice(start, start + pageSize);

    return { success: true, data: { entries: paged, total } };
  }

  async createEntry(input: EntryInput): Promise<ActionResult<Entry>> {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const funds = await this.funds();
    const fund = funds.find((f) => f.id === input.fund_id);
    if (!fund) return { success: false, error: "Fund not found" };

    // Purchase date cannot precede the fund's start date
    if (input.purchase_date < fund.start_date) {
      return {
        success: false,
        error: `Purchase date cannot be before the fund's start date (${fund.start_date})`,
      };
    }

    const now = new Date().toISOString();
    const entry: Entry = {
      id: uuid(),
      user_id: this.userId,
      fund_id: input.fund_id,
      purchase_date: input.purchase_date,
      amount: parsed.data.amount,
      nav: parsed.data.nav,
      units: Math.floor(parsed.data.units), // Guaranteed integer whole units
      notes: input.notes || null,
      created_at: now,
      updated_at: now,
    };

    const entries = await this.entries();
    entries.push(entry);
    await this.setEntries(entries);

    // Auto-update fund_config latest_nav if not set or if entry date is newer/equal
    if (!fund.latest_nav || input.purchase_date >= (fund.latest_nav_date || "")) {
      const fIdx = funds.findIndex((f) => f.id === input.fund_id);
      funds[fIdx] = {
        ...funds[fIdx],
        latest_nav: parsed.data.nav,
        latest_nav_date: input.purchase_date,
        updated_at: now,
      };
      await this.setFunds(funds);
      await this.upsertNav(input.fund_id, input.purchase_date, parsed.data.nav);
    }

    return { success: true, data: entry };
  }

  async updateEntry(
    id: string,
    input: EntryInput
  ): Promise<ActionResult<Entry>> {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const funds = await this.funds();
    const fund = funds.find((f) => f.id === input.fund_id);
    if (!fund) return { success: false, error: "Fund not found" };

    const entries = await this.entries();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return { success: false, error: "Entry not found" };

    const now = new Date().toISOString();
    entries[idx] = {
      ...entries[idx],
      fund_id: input.fund_id,
      purchase_date: input.purchase_date,
      amount: parsed.data.amount,
      nav: parsed.data.nav,
      units: Math.floor(parsed.data.units), // Guaranteed integer whole units
      notes: input.notes || null,
      updated_at: now,
    };
    await this.setEntries(entries);

    await this.upsertNav(input.fund_id, input.purchase_date, parsed.data.nav);

    if (!fund.latest_nav || input.purchase_date >= (fund.latest_nav_date || "")) {
      const fIdx = funds.findIndex((f) => f.id === input.fund_id);
      funds[fIdx] = {
        ...funds[fIdx],
        latest_nav: parsed.data.nav,
        latest_nav_date: input.purchase_date,
        updated_at: now,
      };
      await this.setFunds(funds);
    }

    return { success: true, data: entries[idx] };
  }

  async deleteEntry(id: string): Promise<ActionResult> {
    const entries = await this.entries();
    const next = entries.filter((e) => e.id !== id);
    if (next.length === entries.length) {
      return { success: false, error: "Entry not found" };
    }
    await this.setEntries(next);
    return { success: true };
  }

  async importEntriesFromCsv(
    fundId: string,
    rows: CsvImportRow[]
  ): Promise<ActionResult<CsvImportResult>> {
    const funds = await this.funds();
    const fund = funds.find((f) => f.id === fundId);
    if (!fund) return { success: false, error: "Fund not found" };

    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const valid: Entry[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const parsed = csvRowSchema.safeParse(row);

      if (!parsed.success) {
        skipped++;
        errors.push({ row: i + 1, message: parsed.error.errors[0].message });
        continue;
      }

      // SEBON whole-unit allotment with NPR 5 DP charge
      const effectiveCash = Math.max(0, parsed.data.amount - DP_CHARGE);
      const units =
        parsed.data.units ?? Math.floor(effectiveCash / parsed.data.nav);

      const dateKey = new Date(parsed.data.date);
      const purchaseDate = isNaN(dateKey.getTime())
        ? parsed.data.date
        : `${dateKey.getFullYear()}-${`${dateKey.getMonth() + 1}`.padStart(
            2,
            "0"
          )}-${`${dateKey.getDate()}`.padStart(2, "0")}`;

      valid.push({
        id: uuid(),
        user_id: this.userId,
        fund_id: fundId,
        purchase_date: purchaseDate,
        amount: parsed.data.amount,
        nav: parsed.data.nav,
        units: Math.floor(units), // Always integer whole units
        notes: parsed.data.notes || null,
        created_at: now,
        updated_at: now,
      });
    }

    if (valid.length > 0) {
      const entries = await this.entries();
      await this.setEntries([...entries, ...valid]);

      for (const row of valid) {
        await this.upsertNav(row.fund_id, row.purchase_date, Number(row.nav));
      }

      // Advance fund NAV to the newest imported row
      const maxRow = valid.reduce((prev, cur) =>
        prev.purchase_date > cur.purchase_date ? prev : cur
      );

      if (
        !fund.latest_nav ||
        maxRow.purchase_date >= (fund.latest_nav_date || "")
      ) {
        const fIdx = funds.findIndex((f) => f.id === fundId);
        funds[fIdx] = {
          ...funds[fIdx],
          latest_nav: Number(maxRow.nav),
          latest_nav_date: maxRow.purchase_date,
          updated_at: now,
        };
        await this.setFunds(funds);
      }
    }

    return { success: true, data: { imported: valid.length, skipped, errors } };
  }

  async getFundRolloverCash(fundId: string): Promise<ActionResult<number>> {
    const entries = (await this.entries()).filter((e) => e.fund_id === fundId);
    return { success: true, data: computeFundRolloverCash(entries) };
  }

  // ------------------------------------------------------------
  // NAV history
  // ------------------------------------------------------------

  async getNavHistory(fundId?: string): Promise<NavHistoryRow[]> {
    const rows = await this.navRows();
    const scoped =
      fundId && fundId !== "all"
        ? rows.filter((r) => r.fund_id === fundId)
        : rows;
    return scoped.sort((a, b) => a.nav_date.localeCompare(b.nav_date));
  }

  // ------------------------------------------------------------
  // Notification preferences
  // ------------------------------------------------------------

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return readJson<NotificationPreferences>(
      key.prefs(this.userId),
      DEFAULT_NOTIFICATION_PREFERENCES
    );
  }

  async saveNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<ActionResult> {
    await writeJson(key.prefs(this.userId), prefs);
    return { success: true };
  }

  // ------------------------------------------------------------
  // Notifications log (bell)
  // ------------------------------------------------------------

  private async notifs(): Promise<NotificationItem[]> {
    return readJson<NotificationItem[]>(key.notifications(this.userId), []);
  }

  private async setNotifs(items: NotificationItem[]): Promise<void> {
    await writeJson(key.notifications(this.userId), items);
  }

  async getNotifications(): Promise<ActionResult<NotificationItem[]>> {
    const items = (await this.notifs()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    return { success: true, data: items.slice(0, 20) };
  }

  async markNotificationRead(id: string): Promise<ActionResult> {
    const items = await this.notifs();
    const idx = items.findIndex((n) => n.id === id);
    if (idx < 0) return { success: false, error: "Notification not found" };
    items[idx] = { ...items[idx], is_read: true };
    await this.setNotifs(items);
    return { success: true };
  }

  async markAllNotificationsRead(): Promise<ActionResult> {
    const items = await this.notifs();
    await this.setNotifs(items.map((n) => ({ ...n, is_read: true })));
    return { success: true };
  }

  // ------------------------------------------------------------
  // Account
  // ------------------------------------------------------------

  async deleteAllUserData(): Promise<ActionResult> {
    await AsyncStorage.multiRemove([
      key.funds(this.userId),
      key.entries(this.userId),
      key.nav(this.userId),
      key.prefs(this.userId),
      key.notifications(this.userId),
    ]);
    return { success: true };
  }
}
