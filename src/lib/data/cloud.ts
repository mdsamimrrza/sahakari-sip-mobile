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
import type { ProfileImageResult } from "./store";
import { z } from "zod";
import { DP_CHARGE } from "../constants";
import { csvRowSchema, entrySchema } from "../schemas/entry";
import { fundConfigSchema, updateLatestNavSchema } from "../schemas/fund-config";
import { getSupabase } from "../supabase";
import { loadMobileSession } from "../auth/mobileSession";
import { computeDashboardData, computeFundRolloverCash } from "./analytics";
import { cacheGet, cacheSet, cacheInvalidate } from "./cache";
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

/** Boundary validation for notification preferences (owner id is never part of it). */
const notificationPreferencesSchema = z.object({
  push_enabled: z.boolean(),
  email_enabled: z.boolean(),
  reminder_day: z.number().int().min(0).max(6),
  notify_days_before: z.number().int().min(0).max(30),
});

export class CloudStore implements DataStore {
  readonly mode = "cloud" as const;

  /**
   * Identity for queries: the next_auth.users id from the mobile session.
   * Since the NextAuth migration this is the same id the web app writes
   * its rows with (one account, one id space) — no email mapping needed.
   * Supabase-native auth is gone; the id lives in mobileSession storage
   * and the RLS JWT rides as the Bearer token (src/lib/supabase.ts).
   */
  async getUserId(): Promise<string | null> {
    const session = await loadMobileSession();
    return session?.user.id ?? null;
  }

  /**
   * Kept for merge.ts compatibility: reads of legacy Supabase-auth ids
   * (rows the migration may not have reached) still go through the
   * id SET — the effective id equals the auth id now.
   */
  async getEffectiveUserId(): Promise<string | null> {
    return this.getUserId();
  }

  private get db() {
    return getSupabase();
  }

  private async dataUid(): Promise<string | null> {
    return this.getUserId();
  }

  // ------------------------------------------------------------
  // Dashboard
  // ------------------------------------------------------------

  async getDashboardData(
    fundId = "all"
  ): Promise<ActionResult<DashboardData>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    // Serve the last computed dashboard instantly on focus/revisit;
    // mutations clear this cache so it's never stale after a write.
    const cacheKey = `dash.cloud.${userId}.${fundId}`;
    const cached = cacheGet<DashboardData>(cacheKey);
    if (cached) return { success: true, data: cached };

    // The three queries are independent — run them in one round trip
    // instead of three sequential awaits.
    let entriesQuery = this.db
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .order("purchase_date", { ascending: true });

    if (fundId && fundId !== "all") {
      entriesQuery = entriesQuery.eq("fund_id", fundId);
    }

    let navQuery = this.db
      .from("nav_history")
      .select("fund_id, nav_date, nav_value")
      .eq("user_id", userId)
      .order("nav_date", { ascending: true });

    if (fundId && fundId !== "all") {
      navQuery = navQuery.eq("fund_id", fundId);
    }

    const [fundsRes, entriesRes, navRes] = await Promise.all([
      this.db
        .from("fund_config")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      entriesQuery,
      navQuery,
    ]);

    const fundsError = fundsRes.error;
    const fundsRaw = fundsRes.data;
    const entriesError = entriesRes.error;
    const entriesRaw = entriesRes.data;
    const navRows = navRes.data;

    if (fundsError) return { success: false, error: fundsError.message };
    const funds = (fundsRaw ?? []) as FundConfig[];

    if (entriesError) return { success: false, error: entriesError.message };
    const entries = (entriesRaw ?? []) as Entry[];

    const navHistory: NavHistoryRow[] = (navRows ?? []).map((r: any) => ({
      id: `${r.fund_id}-${r.nav_date}`,
      user_id: userId,
      fund_id: r.fund_id,
      nav_date: r.nav_date,
      nav_value: Number(r.nav_value),
      created_at: "",
    }));

    // Shared market series (nav_reference): ONE row per (fund, date) for
    // ALL users, written by the server cron. Merged under the user's own
    // nav_history rows (manual corrections win) by normalized fund name.
    const fundKeyToIds = new Map<string, string[]>();
    for (const f of funds) {
      const k = f.fund_name.trim().toLowerCase();
      fundKeyToIds.set(k, [...(fundKeyToIds.get(k) ?? []), f.id]);
    }
    if (fundKeyToIds.size > 0) {
      const { data: refData } = await this.db
        .from("nav_reference")
        .select("fund_key, nav_date, nav_value")
        .in("fund_key", [...fundKeyToIds.keys()])
        .order("nav_date", { ascending: true });
      const own = new Set(navHistory.map((r) => `${r.fund_id}|${r.nav_date}`));
      for (const row of (refData ?? []) as any[]) {
        for (const fid of fundKeyToIds.get(String(row.fund_key)) ?? []) {
          const key = `${fid}|${row.nav_date}`;
          if (!own.has(key)) {
            navHistory.push({
              id: `${fid}-${row.nav_date}-ref`,
              user_id: userId,
              fund_id: fid,
              nav_date: row.nav_date,
              nav_value: Number(row.nav_value),
              created_at: "",
            });
          }
        }
      }
      navHistory.sort((a, b) => a.nav_date.localeCompare(b.nav_date));
    }

    const data = computeDashboardData({
      funds,
      entries: entries.map((e) => ({
        ...e,
        amount: Number(e.amount),
        nav: Number(e.nav),
        units: Number(e.units),
      })),
      navHistory,
      fundId,
    });
    cacheSet(cacheKey, data);
    return { success: true, data };
  }

  // ------------------------------------------------------------
  // Fund config
  // ------------------------------------------------------------

  async getFundConfigs(): Promise<ActionResult<FundConfig[]>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const cacheKey = `funds.cloud.${userId}`;
    const cached = cacheGet<FundConfig[]>(cacheKey);
    if (cached) return { success: true, data: cached };

    const { data, error } = await this.db
      .from("fund_config")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) return { success: false, error: error.message };
    const funds = (data ?? []) as FundConfig[];
    cacheSet(cacheKey, funds);
    return { success: true, data: funds };
  }

  async createFundConfig(
    input: FundConfigInput
  ): Promise<ActionResult<FundConfig>> {
    cacheInvalidate();
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
        // Registered SIP schedule - same columns the web writes
        // (20260923_sip_schedule.sql), so the web reminder cron resolves
        // the user's CONFIRMED schedule instead of guessing an anchor.
        frequency: input.frequency ?? null,
        calendar_system: input.calendar_system ?? null,
        anchor_date: input.anchor_date ?? null,
        schedule_verified: input.schedule_verified ?? false,
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
    cacheInvalidate();
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
        // Registered SIP schedule - same columns the web writes, so a
        // schedule confirmed on the phone reaches the web reminder cron.
        frequency: input.frequency ?? null,
        calendar_system: input.calendar_system ?? null,
        anchor_date: input.anchor_date ?? null,
        schedule_verified: input.schedule_verified ?? false,
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
    cacheInvalidate();
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
    cacheInvalidate();
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

    const cacheKey = `entries.cloud.${userId}.${fundId ?? "all"}.${page}.${pageSize}.${sortOrder}`;
    const cached = cacheGet<{ entries: Entry[]; total: number }>(cacheKey);
    if (cached) return { success: true, data: cached };

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

    const result = { entries: (data ?? []) as Entry[], total: count ?? 0 };
    cacheSet(cacheKey, result);
    return { success: true, data: result };
  }

  async createEntry(input: EntryInput): Promise<ActionResult<Entry>> {
    cacheInvalidate();
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
    cacheInvalidate();
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
    cacheInvalidate();
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
    cacheInvalidate();
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data: fund } = await this.db
      .from("fund_config")
      .select("start_date, latest_nav, latest_nav_date")
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

      const rowDate = toDateKey(new Date(parsed.data.date));
      if (rowDate < fund.start_date) {
        skipped++;
        errors.push({
          row: i + 1,
          message: `Date ${rowDate} is before the fund's start date (${fund.start_date})`,
        });
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

    const cacheKey = `navhist.cloud.${userId}.${fundId ?? "all"}`;
    const cached = cacheGet<NavHistoryRow[]>(cacheKey);
    if (cached) return cached;

    let query = this.db
      .from("nav_history")
      .select("*")
      .eq("user_id", userId)
      .order("nav_date", { ascending: true });

    if (fundId && fundId !== "all") query = query.eq("fund_id", fundId);

    const { data } = await query;
    const rows = (data ?? []) as NavHistoryRow[];

    // Shared market series (nav_reference) merged under the user's own
    // rows - manual corrections win per (fund_id, date).
    const fundsRes = await this.db
      .from("fund_config")
      .select("id, fund_name")
      .eq("user_id", userId);
    const fundKeyToIds = new Map<string, string[]>();
    for (const f of (fundsRes.data ?? []) as any[]) {
      const k = String(f.fund_name).trim().toLowerCase();
      fundKeyToIds.set(k, [...(fundKeyToIds.get(k) ?? []), f.id]);
    }
    if (fundKeyToIds.size > 0) {
      const { data: refData } = await this.db
        .from("nav_reference")
        .select("fund_key, nav_date, nav_value")
        .in("fund_key", [...fundKeyToIds.keys()])
        .order("nav_date", { ascending: true });
      const own = new Set(rows.map((r) => `${r.fund_id}|${r.nav_date}`));
      for (const row of (refData ?? []) as any[]) {
        for (const fid of fundKeyToIds.get(String(row.fund_key)) ?? []) {
          const key = `${fid}|${row.nav_date}`;
          if (!own.has(key) && (!fundId || fundId === "all" || fid === fundId)) {
            rows.push({
              id: `${fid}-${row.nav_date}-ref`,
              user_id: userId,
              fund_id: fid,
              nav_date: row.nav_date,
              nav_value: Number(row.nav_value),
              created_at: "",
            });
          }
        }
      }
      rows.sort((a, b) => a.nav_date.localeCompare(b.nav_date));
    }

    cacheSet(cacheKey, rows);
    return rows;
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
    // Validate at the boundary instead of trusting the row shape.
    const parsed = notificationPreferencesSchema.safeParse(data);
    return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_PREFERENCES;
  }

  async saveNotificationPreferences(
    prefs: NotificationPreferences
  ): Promise<ActionResult> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const parsed = notificationPreferencesSchema.safeParse(prefs);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid notification preferences",
      };
    }
    // Owner id LAST: a hostile or legacy payload can never override the
    // bound identity (contrast `{ user_id, ...prefs }`, which lets the
    // spread replace it).
    const { error } = await this.db
      .from("notification_preferences")
      .upsert({ ...parsed.data, user_id: userId }, { onConflict: "user_id" });

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // ------------------------------------------------------------
  // Notifications log (bell)
  // ------------------------------------------------------------

  async getNotifications(): Promise<ActionResult<NotificationItem[]>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const cacheKey = `notifs.cloud.${userId}`;
    const cached = cacheGet<NotificationItem[]>(cacheKey);
    if (cached) return { success: true, data: cached };

    const { data, error } = await this.db
      .from("notifications_log")
      .select("id, title, body, type, url, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { success: false, error: error.message };
    const items = (data ?? []) as NotificationItem[];
    cacheSet(cacheKey, items);
    return { success: true, data: items };
  }

  async markNotificationRead(id: string): Promise<ActionResult> {
    cacheInvalidate();
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { error, count } = await this.db
      .from("notifications_log")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) return { success: false, error: error.message };
    if ((count ?? 0) === 0) return { success: false, error: "Notification not found" };
    return { success: true };
  }

  async markAllNotificationsRead(): Promise<ActionResult> {
    cacheInvalidate();
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

    // VERIFY each purge: RLS admitting the request without matching rows
    // returns success with a zero count (the fix script's "THE PROBLEM"
    // section documents exactly this id-mismatch failure mode). Counting
    // before and after makes a silently no-opped delete impossible.
    const tables = [
      "entries",
      "nav_history",
      "fund_config",
      "notifications_log",
      "notification_preferences",
    ] as const;
    for (const table of tables) {
      const before = await this.db
        .from(table)
        .select("*", { count: "exact", head: true })
        .in("user_id", ids);
      if (before.error) return { success: false, error: before.error.message };
      const expected = before.count ?? 0;

      const { error, count } = await this.db
        .from(table)
        .delete({ count: "exact" })
        .in("user_id", ids);
      if (error) return { success: false, error: error.message };

      const deleted = count ?? 0;
      if (deleted < expected) {
        return {
          success: false,
          error: `Server refused to delete ${expected - deleted} ${table} row(s). Nothing was removed — please contact support.`,
        };
      }
    }

    return { success: true };
  }

  // ------------------------------------------------------------
  // Profile
  // ------------------------------------------------------------

  async getProfile(): Promise<ActionResult<{ name: string | null; image: string | null; email: string | null }>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    const { data, error } = await this.db
      .from("users")
      .select("name, image, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: {
        name: data?.name ?? null,
        image: data?.image ?? null,
        email: data?.email ?? null,
      },
    };
  }

  async updateProfileImage(uri: string, mimeType: string): Promise<ActionResult<ProfileImageResult>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      // Convert file URI to blob for upload
      const response = await fetch(uri);
      const blob = await response.blob();
      if (blob.size > 2 * 1024 * 1024) {
        return { success: false, error: "Image must be under 2MB" };
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(mimeType)) {
        return { success: false, error: "Only JPG, PNG or WebP images are allowed" };
      }

      const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const path = `${userId}/avatar.${ext}`;

      // Remove any previously uploaded avatar files for this user
      try {
        const { data: existing } = await this.db.storage.from("avatars").list(userId);
        const stale = (existing ?? [])
          .filter((f) => f.name !== `avatar.${ext}`)
          .map((f) => `${userId}/${f.name}`);
        if (stale.length > 0) {
          await this.db.storage.from("avatars").remove(stale);
        }
      } catch {
        // best-effort cleanup only
      }

      const { error: uploadError } = await this.db.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        return { success: false, error: uploadError.message };
      }

      const { data: pub } = this.db.storage.from("avatars").getPublicUrl(path);
      const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const { error: dbError } = await this.db
        .from("users")
        .update({ image: imageUrl })
        .eq("id", userId);

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      return { success: true, data: { image: imageUrl } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Upload failed" };
    }
  }

  async removeProfileImage(): Promise<ActionResult<ProfileImageResult>> {
    const userId = await this.dataUid();
    if (!userId) return { success: false, error: "Not authenticated" };

    try {
      // Remove all avatar files for this user
      try {
        const { data: existing } = await this.db.storage.from("avatars").list(userId);
        const paths = (existing ?? []).map((f) => `${userId}/${f.name}`);
        if (paths.length > 0) {
          await this.db.storage.from("avatars").remove(paths);
        }
      } catch {
        // best-effort cleanup only
      }

      const { error } = await this.db
        .from("users")
        .update({ image: null })
        .eq("id", userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: { image: null } };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Remove failed" };
    }
  }
}
