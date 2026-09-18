// ============================================================
// SahakariSIP — Cloud Data Store (Supabase)
// ============================================================
// Mirrors the web app's server actions against the *same* Supabase
// project and the *same* tables (fund_config, entries, nav_history),
// but as the authenticated user rather than as the service role — so
// Row Level Security does the per-user isolation.
//
// Business rules (whole-unit allotment, DP charge, nav_history upsert,
// latest_nav auto-advance, deletion guards) are byte-for-byte the same
// as the on-device store.
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
import { DP_CHARGE } from "../constants";
import { csvRowSchema, entrySchema } from "../schemas/entry";
import { fundConfigSchema, updateLatestNavSchema } from "../schemas/fund-config";
import { getSupabase } from "../supabase";
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
import { todayKey, toDateKey } from "../format";

export class CloudStore implements DataStore {
  readonly mode = "cloud" as const;

  async getUserId(): Promise<string | null> {
    const { data } = await getSupabase().auth.getUser();
    return data.user?.id ?? null;
  }

  private get db() {
    return getSupabase();
  }

  private async uid(): Promise<string | null> {
    return this.getUserId();
  }

  /**
   * Effective user id for data queries. The web app's NextAuth stores its
   * users in next_auth.users and writes fund_config/entries/nav_history
   * with user_id = next_auth.users.id, while this app signs in via Supabase
   * Auth (auth.users) — a different id space. The `app_effective_user_id`
   * RPC (see supabase-fix-user-mapping.sql) maps the signed-in Supabase
   * Auth user to the web's NextAuth id BY EMAIL, so an existing user's
   * portfolio shows up instead of a fresh onboarding. Falls back to the
   * Supabase Auth id when the RPC is missing or the email has no web
   * account. Cached per store instance.
   */
  private effectiveId: string | null = null;

  private async dataUid(): Promise<string | null> {
    if (this.effectiveId) return this.effectiveId;

    const authId = await this.getUserId();
    if (!authId) return null;

    try {
      // Ensure a next_auth.users row exists for this account (idempotent) —
      // fund_config.user_id has a FK to next_auth.users(id), so a mobile-only
      // account could otherwise never create funds. See
      // supabase-fix-user-mapping.sql.
      await this.db.rpc("app_ensure_user_row");

      // Resolve the effective id: the web's NextAuth id for this email
      // (sees web-created data), falling back to the Supabase Auth id.
      const { data } = await this.db.rpc("app_effective_user_id");
      if (typeof data === "string" && data) {
        this.effectiveId = data;
        return this.effectiveId;
      }
    } catch {
      // RPCs not deployed yet — fall back to the Supabase Auth id.
    }

    this.effectiveId = authId;
    return this.effectiveId;
  }

  // ------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------

  async getDashboardData(
    fundId = "all"
  ): Promise<ActionResult<DashboardData>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: fundsRaw, error: fundsError } = await this.db
      .from("fund_config")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (fundsError) return { success: false, error: fundsError.message };
    const funds = (fundsRaw ?? []) as FundConfig[];

    let entriesQuery = this.db
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .order("purchase_date", { ascending: true });

    if (fundId && fundId !== "all") {
      entriesQuery = entriesQuery.eq("fund_id", fundId);
    }

    const { data: entriesRaw, error: entriesError } = await entriesQuery;
    if (entriesError) return { success: false, error: entriesError.message };
    const entries = (entriesRaw ?? []) as Entry[];

    let navQuery = this.db
      .from("nav_history")
      .select("fund_id, nav_date, nav_value")
      .eq("user_id", userId)
      .order("nav_date", { ascending: true });

    if (fundId && fundId !== "all") {
      navQuery = navQuery.eq("fund_id", fundId);
    }

    const { data: navRows } = await navQuery;

    const navHistory: NavHistoryRow[] = (navRows ?? []).map((r: any) => ({
      id: `${r.fund_id}-${r.nav_date}`,
      user_id: userId,
      fund_id: r.fund_id,
      nav_date: r.nav_date,
      nav_value: Number(r.nav_value),
      created_at: "",
    }));

    return {
      success: true,
      data: computeDashboardData({
        funds,
        entries: entries.map((e) => ({
          ...e,
          amount: Number(e.amount),
          nav: Number(e.nav),
          units: Number(e.units),
        })),
        navHistory,
        fundId,
      }),
    };
  }

  // ------------------------------------------------------------
  // Fund config
  // ------------------------------------------------------------

  async getFundConfigs(): Promise<ActionResult<FundConfig[]>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data, error } = await this.db
      .from("fund_config")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as FundConfig[] };
  }

  async createFundConfig(
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>> {
    const parsed = fundConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data, error } = await this.db
      .from("fund_config")
      .insert({
        user_id: userId,
        fund_name: parsed.data.fund_name,
        fee_rate_pct: parsed.data.fee_rate_pct,
        start_date: input.start_date,
        monthly_sip: parsed.data.monthly_sip,
        latest_nav: parsed.data.latest_nav,
        latest_nav_date: input.start_date,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await this.db.from("nav_history").upsert(
      {
        fund_id: data.id,
        user_id: userId,
        nav_date: input.start_date,
        nav_value: parsed.data.latest_nav,
      },
      { onConflict: "fund_id,nav_date" }
    );

    return { success: true, data: data as FundConfig };
  }

  async updateFundConfig(
    id: string,
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>> {
    const parsed = fundConfigSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: existingFund } = await this.db
      .from("fund_config")
      .select("latest_nav, latest_nav_date")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!existingFund) return { success: false, error: "Fund not found" };

    const navChanged =
      Number(existingFund.latest_nav) !== parsed.data.latest_nav;
    const newNavDate = navChanged
      ? todayKey()
      : existingFund.latest_nav_date ?? input.start_date;

    const { data, error } = await this.db
      .from("fund_config")
      .update({
        fund_name: parsed.data.fund_name,
        fee_rate_pct: parsed.data.fee_rate_pct,
        start_date: input.start_date,
        monthly_sip: parsed.data.monthly_sip,
        latest_nav: parsed.data.latest_nav,
        ...(navChanged ? { latest_nav_date: newNavDate } : {}),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    if (navChanged) {
      await this.db.from("nav_history").upsert(
        {
          fund_id: id,
          user_id: userId,
          nav_date: newNavDate,
          nav_value: parsed.data.latest_nav,
        },
        { onConflict: "fund_id,nav_date" }
      );
    }

    return { success: true, data: data as FundConfig };
  }

  async deleteFundConfig(id: string): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { count, error: countError } = await this.db
      .from("entries")
      .select("id", { count: "exact", head: true })
      .eq("fund_id", id)
      .eq("user_id", userId);

    if (countError) return { success: false, error: countError.message };

    if (count && count > 0) {
      return {
        success: false,
        error: `This fund has ${count} ${
          count === 1 ? "entry" : "entries"
        }. Please delete all entries for this fund first.`,
      };
    }

    const { error, count: deleted } = await this.db
      .from("fund_config")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    if (deleted === 0) return { success: false, error: "Fund not found" };

    return { success: true };
  }

  async updateLatestNav(input: LatestNavInput): Promise<ActionResult> {
    const parsed = updateLatestNavSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error, count } = await this.db
      .from("fund_config")
      .update(
        {
          latest_nav: parsed.data.latest_nav,
          latest_nav_date: input.latest_nav_date,
        },
        { count: "exact" }
      )
      .eq("id", input.fund_id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: "Fund not found" };

    await this.db.from("nav_history").upsert(
      {
        fund_id: input.fund_id,
        user_id: userId,
        nav_date: input.latest_nav_date,
        nav_value: parsed.data.latest_nav,
      },
      { onConflict: "fund_id,nav_date" }
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

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    let query = this.db
      .from("entries")
      .select("*", { count: "exact" })
      .eq("user_id", userId);

    if (fundId) query = query.eq("fund_id", fundId);

    query = query
      .order("purchase_date", { ascending: sortOrder === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1);

    const { data, count, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: { entries: (data ?? []) as Entry[], total: count ?? 0 },
    };
  }

  async createEntry(input: EntryInput): Promise<ActionResult<Entry>> {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: fund } = await this.db
      .from("fund_config")
      .select("start_date, latest_nav, latest_nav_date")
      .eq("id", input.fund_id)
      .eq("user_id", userId)
      .single();

    if (!fund) return { success: false, error: "Fund not found" };

    if (input.purchase_date < fund.start_date) {
      return {
        success: false,
        error: `Purchase date cannot be before the fund's start date (${fund.start_date})`,
      };
    }

    const { data, error } = await this.db
      .from("entries")
      .insert({
        user_id: userId,
        fund_id: input.fund_id,
        purchase_date: input.purchase_date,
        amount: parsed.data.amount,
        nav: parsed.data.nav,
        units: Math.floor(parsed.data.units), // Guaranteed integer
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    if (
      !fund.latest_nav ||
      input.purchase_date >= (fund.latest_nav_date || "")
    ) {
      await this.db
        .from("fund_config")
        .update({
          latest_nav: parsed.data.nav,
          latest_nav_date: input.purchase_date,
        })
        .eq("id", input.fund_id)
        .eq("user_id", userId);

      await this.db.from("nav_history").upsert(
        {
          fund_id: input.fund_id,
          user_id: userId,
          nav_date: input.purchase_date,
          nav_value: parsed.data.nav,
        },
        { onConflict: "fund_id,nav_date" }
      );
    }

    return { success: true, data: data as Entry };
  }

  async updateEntry(
    id: string,
    input: EntryInput
  ): Promise<ActionResult<Entry>> {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message };
    }

    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: fund } = await this.db
      .from("fund_config")
      .select("latest_nav, latest_nav_date")
      .eq("id", input.fund_id)
      .eq("user_id", userId)
      .single();

    if (!fund) return { success: false, error: "Fund not found" };

    const { data, error } = await this.db
      .from("entries")
      .update({
        fund_id: input.fund_id,
        purchase_date: input.purchase_date,
        amount: parsed.data.amount,
        nav: parsed.data.nav,
        units: Math.floor(parsed.data.units), // Guaranteed integer
        notes: input.notes || null,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    await this.db.from("nav_history").upsert(
      {
        fund_id: input.fund_id,
        user_id: userId,
        nav_date: input.purchase_date,
        nav_value: parsed.data.nav,
      },
      { onConflict: "fund_id,nav_date" }
    );

    if (
      !fund.latest_nav ||
      input.purchase_date >= (fund.latest_nav_date || "")
    ) {
      await this.db
        .from("fund_config")
        .update({
          latest_nav: parsed.data.nav,
          latest_nav_date: input.purchase_date,
        })
        .eq("id", input.fund_id)
        .eq("user_id", userId);
    }

    return { success: true, data: data as Entry };
  }

  async deleteEntry(id: string): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error, count } = await this.db
      .from("entries")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: "Entry not found" };

    return { success: true };
  }

  async importEntriesFromCsv(
    fundId: string,
    rows: CsvImportRow[]
  ): Promise<ActionResult<CsvImportResult>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: fund } = await this.db
      .from("fund_config")
      .select("latest_nav, latest_nav_date")
      .eq("id", fundId)
      .eq("user_id", userId)
      .single();

    if (!fund) return { success: false, error: "Fund not found" };

    let skipped = 0;
    const errors: Array<{ row: number; message: string }> = [];
    const validRows: Array<Record<string, unknown>> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const parsed = csvRowSchema.safeParse(row);

      if (!parsed.success) {
        skipped++;
        errors.push({ row: i + 1, message: parsed.error.errors[0].message });
        continue;
      }

      const effectiveCash = Math.max(0, parsed.data.amount - DP_CHARGE);
      const units =
        parsed.data.units ?? Math.floor(effectiveCash / parsed.data.nav);

      validRows.push({
        user_id: userId,
        fund_id: fundId,
        purchase_date: toDateKey(new Date(parsed.data.date)),
        amount: parsed.data.amount,
        nav: parsed.data.nav,
        units: Math.floor(units), // Always integer whole units
        notes: parsed.data.notes || null,
      });
    }

    if (validRows.length > 0) {
      const { error } = await this.db.from("entries").insert(validRows);
      if (error) return { success: false, error: error.message };

      await this.db.from("nav_history").upsert(
        validRows.map((r) => ({
          fund_id: r.fund_id,
          user_id: r.user_id,
          nav_date: r.purchase_date,
          nav_value: r.nav,
        })),
        { onConflict: "fund_id,nav_date" }
      );

      const maxRow = validRows.reduce((prev, current) =>
        String(prev.purchase_date) > String(current.purchase_date)
          ? prev
          : current
      );

      if (
        !fund.latest_nav ||
        String(maxRow.purchase_date) >= (fund.latest_nav_date || "")
      ) {
        await this.db
          .from("fund_config")
          .update({
            latest_nav: maxRow.nav,
            latest_nav_date: maxRow.purchase_date,
          })
          .eq("id", fundId)
          .eq("user_id", userId);
      }
    }

    return { success: true, data: { imported: validRows.length, skipped, errors } };
  }

  async getFundRolloverCash(fundId: string): Promise<ActionResult<number>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data, error } = await this.db
      .from("entries")
      .select("amount, nav, units, purchase_date, created_at")
      .eq("user_id", userId)
      .eq("fund_id", fundId)
      .order("purchase_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: computeFundRolloverCash(
        (data ?? []).map((r: any) => ({
          amount: Number(r.amount),
          nav: Number(r.nav),
          units: Number(r.units),
          purchase_date: r.purchase_date,
          created_at: r.created_at,
        }))
      ),
    };
  }

  // ------------------------------------------------------------
  // NAV history
  // ------------------------------------------------------------

  async getNavHistory(fundId?: string): Promise<NavHistoryRow[]> {
    const userId = await this.dataUid();
    if (!userId) return [];

    let query = this.db
      .from("nav_history")
      .select("*")
      .eq("user_id", userId)
      .order("nav_date", { ascending: true });

    if (fundId && fundId !== "all") query = query.eq("fund_id", fundId);

    const { data } = await query;
    return (data ?? []) as NavHistoryRow[];
  }

  // ------------------------------------------------------------
  // Notification preferences
  // ------------------------------------------------------------

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const userId = await this.dataUid();
    if (!userId) return DEFAULT_NOTIFICATION_PREFERENCES;

    const { data } = await this.db
      .from("notification_preferences")
      .select("push_enabled, email_enabled, reminder_day, notify_days_before")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return DEFAULT_NOTIFICATION_PREFERENCES;
    return data as NotificationPreferences;
  }

  async saveNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error } = await this.db
      .from("notification_preferences")
      .upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ------------------------------------------------------------
  // Notifications log (bell)
  // ------------------------------------------------------------

  async getNotifications(): Promise<ActionResult<NotificationItem[]>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data, error } = await this.db
      .from("notifications_log")
      .select("id, title, body, type, url, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as NotificationItem[] };
  }

  async markNotificationRead(id: string): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error } = await this.db
      .from("notifications_log")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  async markAllNotificationsRead(): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error } = await this.db
      .from("notifications_log")
      .update({ is_read: true })
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ------------------------------------------------------------
  // Account
  // ------------------------------------------------------------

  async deleteAllUserData(): Promise<ActionResult> {
    const authId = await this.getUserId();
    if (!authId) return { success: false, error: "Not authenticated" };
    const userId = (await this.dataUid()) ?? authId;

    // The effective id (web NextAuth id) and the Supabase Auth id can both
    // own rows; purge every row under either id space. RLS scopes deletes.
    const ids = Array.from(new Set([userId, authId]));

    const { error: e1 } = await this.db
      .from("entries")
      .delete()
      .in("user_id", ids);
    if (e1) return { success: false, error: e1.message };

    const { error: e2 } = await this.db
      .from("nav_history")
      .delete()
      .in("user_id", ids);
    if (e2) return { success: false, error: e2.message };

    const { error: e3 } = await this.db
      .from("fund_config")
      .delete()
      .in("user_id", ids);
    if (e3) return { success: false, error: e3.message };

    const { error: e4 } = await this.db
      .from("notifications_log")
      .delete()
      .in("user_id", ids);
    if (e4) return { success: false, error: e4.message };

    return { success: true };
  }
}
