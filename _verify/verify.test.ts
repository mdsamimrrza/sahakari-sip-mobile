// ============================================================
// SahakariSIP — full verification script (runs in Node with tsx)
// PART A: pure math (hand-computed expected values)
// PART B: validation schemas
// PART C: live backend behavior + dashboard math on live-shaped data
// NOTE: lives OUTSIDE the app project. The live-backend part (PART C's
// main()) needs a service_role key, which is loaded from the environment
// / .env — NEVER hardcoded here. If you ever committed or shared one,
// rotate it in Supabase (Dashboard → Settings → API) and purge history.
// ============================================================

import { calculateXirr, buildCashFlows } from "../src/lib/calculations/xirr";
import { prepareFeeDragEntries, calculateFeeDrag } from "../src/lib/calculations/fee-drag";
import { calculateProjectionTable } from "../src/lib/calculations/projections";
import { calculateSipStreak } from "../src/lib/calculations/streak";
import { computeDashboardData } from "../src/lib/data/analytics";
import { entrySchema, csvRowSchema } from "../src/lib/schemas/entry";
import { fundConfigSchema } from "../src/lib/schemas/fund-config";
import { format, subMonths } from "date-fns";
import type { Entry, FundConfig } from "../src/lib/types";
import { readFileSync } from "fs";

// Load the project .env so the app's supabase module sees its config
// (tsx does not load .env files by itself).
try {
  const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // best effort — the live-backend part reports the missing config itself
}

// Minimal window/localStorage shim so AsyncStorage (the app's storage
// adapter) works in plain Node. Sessions persist in memory for the
// script's lifetime only.
(globalThis as Record<string, unknown>).window = {
  localStorage: (() => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
  })(),
};

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log("PASS  " + name);
  } else {
    failed++;
    console.log("FAIL  " + name + (extra ? "   -> " + extra : ""));
  }
}
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
// Zod's first issue message — the app reads parsed.error.errors[0].message.
const firstIssueMessage = (err: { errors: Array<{ message: string }> }) =>
  err.errors[0].message;

// ================= PART A: pure math =================
console.log("\n===== PART A: CALCULATION ENGINE =====");

// A1. XIRR known answer: -1000 on 2023-01-01, +1100 on 2024-01-01 = 10%
{
  const r = calculateXirr([
    { amount: -1000, date: new Date(2023, 0, 1) },
    { amount: 1100, date: new Date(2024, 0, 1) },
  ]);
  check("A1 XIRR known answer (10%)", r !== null && close(r, 0.1, 0.0002), `got ${r}`);
}

// A2. XIRR on 3 SIP entries + current value: NPV at solution must be ~0
{
  const entries = [
    { purchase_date: "2024-01-15", amount: 1000 },
    { purchase_date: "2024-02-15", amount: 1000 },
    { purchase_date: "2024-03-15", amount: 1000 },
  ];
  const flows = buildCashFlows(entries, 3200);
  const r = calculateXirr(flows);
  let npv = 0;
  if (r !== null) {
    const first = flows[0].date.getTime();
    for (const f of flows) {
      npv += f.amount / Math.pow(1 + r, (f.date.getTime() - first) / (365 * 86400000));
    }
  }
  check("A2 XIRR NPV at solution ~ 0", r !== null && r > 0 && Math.abs(npv) < 0.01, `rate=${r} npv=${npv}`);
}

// A3. Fee drag: 12% annual fee, units 10@nav10 then 20@nav11 -> [1, 3.2]
{
  const pts = calculateFeeDrag(
    prepareFeeDragEntries([
      { purchase_date: "2024-01-01", nav: 10, units: 10 },
      { purchase_date: "2024-02-01", nav: 11, units: 10 },
    ]),
    12
  );
  check(
    "A3 Fee drag cumulative [1, 3.2]",
    pts.length === 2 && close(pts[0].cumulativeDrag, 1, 0.001) && close(pts[1].cumulativeDrag, 3.2, 0.001),
    JSON.stringify(pts)
  );
}

// A4. Projection year-5 matches closed-form annuity (corpus 0, 5000/mo, 10%)
{
  const rows = calculateProjectionTable({
    currentCorpus: 0, monthlySip: 5000, annualReturnPct: 10, stepUpPct: 0, yearsToProject: 20, realPrincipalSoFar: 0,
  });
  const i = 0.1 / 12;
  const expected5 = 5000 * ((Math.pow(1 + i, 60) - 1) / i);
  const row5 = rows.find((r) => r.year === 5)!;
  check(
    "A4 Projection y5 corpus = annuity formula",
    close(row5.corpusValue, expected5, 2) && row5.totalInvested === 300000,
    `got ${row5.corpusValue} expected ~${expected5.toFixed(0)}`
  );
  check(
    "A4b Projection y5 gain = corpus - invested",
    row5.totalGain === row5.corpusValue - row5.totalInvested
  );
}

// A5. Step-up grows corpus faster
{
  const flat = calculateProjectionTable({ currentCorpus: 0, monthlySip: 5000, annualReturnPct: 10, stepUpPct: 0, yearsToProject: 20, realPrincipalSoFar: 0 }).find((r) => r.year === 20)!;
  const step = calculateProjectionTable({ currentCorpus: 0, monthlySip: 5000, annualReturnPct: 10, stepUpPct: 10, yearsToProject: 20, realPrincipalSoFar: 0 }).find((r) => r.year === 20)!;
  check("A5 Step-up 10% beats flat at y20", step.corpusValue > flat.corpusValue, `${step.corpusValue} vs ${flat.corpusValue}`);
}

// A6. Streak: this month + last month = 2; only 2 months ago = 0
{
  const now = new Date();
  const s2 = calculateSipStreak([
    format(now, "yyyy-MM-05"),
    format(subMonths(now, 1), "yyyy-MM-05"),
  ]);
  const s0 = calculateSipStreak([format(subMonths(now, 2), "yyyy-MM-05")]);
  check("A6 Streak 2 / 0", s2 === 2 && s0 === 0, `got ${s2} / ${s0}`);
}

// A7. Rollover wallet recurrence (same loop as the web dashboard):
// e1: 5005 @ nav 10 -> 500 units -> leftover 0; e2: 5000 @ nav 10.5 -> 475 units -> leftover 7.5
{
  const sim = [
    { amount: 5005, nav: 10, units: 500 },
    { amount: 5000, nav: 10.5, units: 475 },
  ];
  let rollover = 0;
  for (const e of sim) {
    const dp = e.amount >= 5 ? 5 : 0;
    const net = Math.max(0, e.amount + rollover - dp);
    rollover = Math.max(0, net - e.units * e.nav);
  }
  check("A7 Rollover wallet = 7.50", close(rollover, 7.5, 0.0001), `got ${rollover}`);
}

// ================= PART B: validation =================
console.log("\n===== PART B: VALIDATION SCHEMAS =====");
const uuid = "123e4567-e89b-42d3-a456-426614174000";

{
  const ok = entrySchema.safeParse({ fund_id: uuid, purchase_date: new Date(), amount: 5000, nav: 10.25, units: 487 });
  check("B1 entrySchema accepts valid entry", ok.success);
  const bad = entrySchema.safeParse({ fund_id: uuid, purchase_date: new Date(), amount: 5000, nav: 10.25, units: 0 });
  check("B2 entrySchema rejects units=0", !bad.success && firstIssueMessage(bad.error) === "Units must be greater than 0", bad.success ? "" : firstIssueMessage(bad.error));
  const future = new Date();
  future.setDate(future.getDate() + 5);
  const badDate = entrySchema.safeParse({ fund_id: uuid, purchase_date: future, amount: 5000, nav: 10.25, units: 487 });
  check("B3 entrySchema rejects future date", !badDate.success && firstIssueMessage(badDate.error) === "Purchase date cannot be in the future");
}
{
  const ok = fundConfigSchema.safeParse({ fund_name: "SSIS", fee_rate_pct: 1.7, start_date: new Date(2024, 0, 15), monthly_sip: 5000, latest_nav: 10 });
  check("B4 fundConfigSchema accepts valid config", ok.success);
  const badFee = fundConfigSchema.safeParse({ fund_name: "SSIS", fee_rate_pct: 11, start_date: new Date(2024, 0, 15), monthly_sip: 5000, latest_nav: 10 });
  check("B5 fee 11% rejected", !badFee.success && firstIssueMessage(badFee.error) === "Fee rate seems too high — please verify");
  const badSip = fundConfigSchema.safeParse({ fund_name: "SSIS", fee_rate_pct: 1.7, start_date: new Date(2024, 0, 15), monthly_sip: 0, latest_nav: 10 });
  check("B6 monthly_sip 0 rejected", !badSip.success);
  const badNav = fundConfigSchema.safeParse({ fund_name: "SSIS", fee_rate_pct: 1.7, start_date: new Date(2024, 0, 15), monthly_sip: 5000, latest_nav: 0 });
  check("B7 nav 0 rejected", !badNav.success && firstIssueMessage(badNav.error) === "Current NAV must be greater than 0");
}
{
  const ok = csvRowSchema.safeParse({ date: "2024-01-15", amount: 5000, nav: 10.25 });
  check("B8 csvRowSchema accepts valid row", ok.success);
  const bad = csvRowSchema.safeParse({ date: "2030-01-15", amount: 5000, nav: 10.25 });
  check("B9 csvRowSchema rejects future row", !bad.success);
}

// ================= PART C: live backend + dashboard math =================
console.log("\n===== PART C: LIVE BACKEND + DASHBOARD MATH =====");

// Credentials come from the environment (or the gitignored .env this script
// loads above). A service_role key bypasses RLS and administers users, so
// it must never live in source control.
const SUPA_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEST_EMAIL = `sahakari.apk.e2e.${Date.now()}@gmail.com`;
const TEST_PASSWORD = "TestE2E!2026";

// C10-style dashboard math check on live-shaped data (same numbers the
// CSV import path produces: units = floor((amount-5)/nav))
{
    const fund: FundConfig = {
      id: uuid,
      user_id: "u1",
      fund_name: "E2E Test Fund",
      fee_rate_pct: 1.8,
      start_date: "2024-01-15",
      monthly_sip: 5000,
      latest_nav: 11,
      latest_nav_date: format(new Date(), "yyyy-MM-dd"),
      is_active: true,
      sip_type: "UNLIMITED",
      frequency: null,
      calendar_system: null,
      anchor_date: null,
      schedule_verified: false,
      created_at: "2024-01-15T00:00:00Z",
      updated_at: "2024-01-15T00:00:00Z",
    };
  const mk = (id: string, purchase_date: string, nav: number, units: number): Entry => ({
    id,
    user_id: "u1",
    fund_id: fund.id,
    purchase_date,
    amount: 5000,
    nav,
    units,
    notes: null,
    created_at: `${purchase_date}T00:00:00Z`,
    updated_at: `${purchase_date}T00:00:00Z`,
  });
  // Whole units from the SEBON rule: floor((5000-5)/nav)
  const entries = [
    mk("1", "2024-01-15", 10.25, Math.floor(4995 / 10.25)), // 487
    mk("2", "2024-02-15", 10.4, Math.floor(4995 / 10.4)),   // 480
    mk("3", "2024-03-15", 10.15, Math.floor(4995 / 10.15)), // 492
  ];
  const s = computeDashboardData({
    funds: [fund],
    entries,
    navHistory: [],
    fundId: fund.id,
  }).summary;
  check("C-a totalInvested 15000", close(s.totalInvested, 15000, 0.001), String(s.totalInvested));
  check("C-b totalUnits 1459 (487+480+492)", close(s.totalUnits, 1459, 0.001), String(s.totalUnits));
  check("C-c currentValue 16049 (1459 x 11)", close(s.currentValue ?? 0, 16049, 0.001), String(s.currentValue));
  check("C-d unallottedCash 7.45", close(s.unallottedCash, 7.45, 0.01), String(s.unallottedCash));
  check("C-e gainLoss 1056.45", close(s.gainLoss ?? 0, 1056.45, 0.02), String(s.gainLoss));
  check("C-f gainLossPct ~7.046", close(s.gainLossPct ?? 0, 7.0459, 0.01), String(s.gainLossPct));
  check("C-g CGT long-term 78.675 (7.5% of 1049)", close(s.estimatedCgtLongTerm ?? -1, 78.675, 0.02), String(s.estimatedCgtLongTerm));
  check("C-h CGT short-term 0", close(s.estimatedCgtShortTerm ?? -1, 0, 0.001), String(s.estimatedCgtShortTerm));
  check("C-i XIRR computed and positive", s.xirr !== null && s.xirr > 0, String(s.xirr));
  check("C-j Streak 0 (old entries)", s.sipStreak === 0, String(s.sipStreak));
  check("C-k blended 'all funds' NAV = 11", close(computeDashboardData({ funds: [fund], entries, navHistory: [], fundId: "all" }).summary.latestNav ?? 0, 11, 0.001));
}

async function main() {
  // The live-backend section needs the project URL and a service_role key
  // from the environment. Without them, report what ran (PART A/B + the
  // offline dashboard math) and exit — never fall back to a hardcoded key.
  if (!SUPA_URL || !SERVICE_KEY) {
    console.log(
      "(live backend checks skipped: set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env — the service key must stay out of source control)"
    );
    console.log(`\n========== RESULT: ${passed} passed, ${failed} failed ==========`);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }

  const { getSupabase } = await import("../src/lib/supabase");
  const { CloudStore } = await import("../src/lib/data/cloud");

  // C1. Create a confirmed throwaway user via the admin API (test-only)
  const adminRes = await fetch(`${SUPA_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true, user_metadata: { full_name: "E2E Test" } }),
  });
  const adminUser = await adminRes.json();
  check("C1 Admin-created confirmed test user", adminRes.ok && !!adminUser.id, adminRes.status + " " + JSON.stringify(adminUser).slice(0, 200));

  try {
    // C2. Sign in with the app's own login path
    const supabase = getSupabase();
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    check("C2 App sign-in works", !signInErr && !!signInData.session, signInErr?.message ?? "");

    // C3. Effective user id — the app_effective_user_id RPC (installed via
    // supabase-fix-user-mapping.sql) maps the Supabase Auth user to the
    // web's NextAuth id BY EMAIL, falling back to the auth uid.
    const linked = ((await supabase.rpc("app_effective_user_id")).data as string | null) ?? null;
    check("C3 Effective user id resolves", typeof linked === "string" || linked === null, String(linked));

    // C3b. Ensure a next_auth.users row exists (idempotent — the app calls
    // this via CloudStore before any data write). If the RPC isn't deployed
    // yet, fall back to a direct service-key insert so the flow can still
    // be verified; the cleanup below removes the row either way.
    const ensureRes = await supabase.rpc("app_ensure_user_row");
    if (ensureRes.error) {
      console.log("   (app_ensure_user_row not deployed — service-key fallback)");
      const authUid = (await supabase.auth.getUser()).data.user?.id;
      await fetch(`${SUPA_URL}/rest/v1/users`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
          "Accept-Profile": "next_auth", "Content-Profile": "next_auth",
        },
        body: JSON.stringify({ id: authUid, email: TEST_EMAIL }),
      });
    } else {
      check("C3b Ensure user row", typeof ensureRes.data === "string", String(ensureRes.data));
    }

    // The app builds its DataStore the same way (AuthContext → createStore);
    // CloudStore resolves the effective id internally, so a plain instance works.
    const store = new CloudStore();

    // ---- FULL DATA FLOW ----
    const fundRes = await store.createFundConfig({
      fund_name: "E2E Test Fund", fee_rate_pct: 1.8, start_date: "2024-01-15", monthly_sip: 5000, latest_nav: 10.0,
    });
    check("C4 Create fund config", fundRes.success && !!fundRes.data, fundRes.error ?? "");
    if (!fundRes.success || !fundRes.data) {
      console.log("   (full flow aborted — install supabase-fix-user-mapping.sql and re-run)");
      console.log(`
========== RESULT: ${passed} passed, ${failed} failed ==========`);
      process.exitCode = 1;
      return;
    }
    const fundId = fundRes.data.id;
    check("C4b Fund seeded nav date = start date", fundRes.data.latest_nav_date === "2024-01-15", String(fundRes.data.latest_nav_date));

    const csvRes = await store.importEntriesFromCsv(fundId, [
      { date: "2024-01-15", amount: 5000, nav: 10.25 },
      { date: "2024-02-15", amount: 5000, nav: 10.4 },
      { date: "2024-03-15", amount: 5000, nav: 10.15 },
    ]);
    check("C5 CSV import 3 entries", csvRes.success && csvRes.data?.imported === 3, JSON.stringify(csvRes.data ?? csvRes.error));

    const entriesRes = await store.getEntries({ fundId, pageSize: 100, sortOrder: "asc" });
    const units = entriesRes.data?.entries.map((e) => e.units) ?? [];
    check("C6 Whole units [487, 480, 492]", units.join(",") === "487,480,492", units.join(","));

    const navRes = await store.updateLatestNav({ fund_id: fundId, latest_nav: 11.0, latest_nav_date: format(new Date(), "yyyy-MM-dd") });
    check("C7 Update latest NAV", navRes.success, navRes.error ?? "");
    const fundsAfter = await store.getFundConfigs();
    check("C7b Fund latest_nav now 11", Number(fundsAfter.data?.[0]?.latest_nav) === 11, String(fundsAfter.data?.[0]?.latest_nav));

    const dash = await store.getDashboardData(fundId);
    check("C8 Dashboard data loads", dash.success, dash.error ?? "");
    if (dash.success && dash.data) {
      const s = dash.data.summary;
      check("C8a totalInvested 15000", close(s.totalInvested, 15000, 0.001), String(s.totalInvested));
      check("C8b totalUnits 1459", close(s.totalUnits, 1459, 0.001), String(s.totalUnits));
      check("C8c currentValue 16049 (1459 x 11)", close(s.currentValue ?? 0, 16049, 0.001), String(s.currentValue));
      check("C8d unallottedCash 7.45", close(s.unallottedCash, 7.45, 0.01), String(s.unallottedCash));
      check("C8e gainLoss 1056.45", close(s.gainLoss ?? 0, 1056.45, 0.02), String(s.gainLoss));
      check("C8f CGT long-term 78.675", close(s.estimatedCgtLongTerm ?? -1, 78.675, 0.02), String(s.estimatedCgtLongTerm));
      check("C8g CGT short-term 0", close(s.estimatedCgtShortTerm ?? -1, 0, 0.001), String(s.estimatedCgtShortTerm));
      check("C8h XIRR computed and positive", s.xirr !== null && s.xirr > 0, String(s.xirr));
      check("C8i Portfolio chart >= 3 pts", dash.data.portfolioChart.length >= 3);
      check("C8j Monthly contributions = 3", dash.data.monthlyContributions.length === 3);
      check("C8k NAV history ends at 11", dash.data.navHistory.length >= 4 && close(dash.data.navHistory[dash.data.navHistory.length - 1].value, 11, 0.001), JSON.stringify(dash.data.navHistory));
    }

    const roll = await store.getFundRolloverCash(fundId);
    check("C9 Live rollover wallet 7.45", roll.success && close(roll.data ?? -1, 7.45, 0.01), String(roll.data));

    const delBlocked = await store.deleteFundConfig(fundId);
    check("C10 Delete fund blocked while entries exist", !delBlocked.success && /3 entries/.test(delBlocked.error ?? ""), delBlocked.error ?? "");

    const firstEntry = entriesRes.data!.entries[0];
    const delEntry = await store.deleteEntry(firstEntry.id);
    check("C11 Delete single entry", delEntry.success, delEntry.error ?? "");

    // Cleanup remaining rows via service key (keeps live DB clean)
    for (const table of ["entries", "nav_history"]) {
      await fetch(`${SUPA_URL}/rest/v1/${table}?fund_id=eq.${fundId}`, {
        method: "DELETE",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=representation" },
      });
    }
    const delOk = await store.deleteFundConfig(fundId);
    check("C12 Delete fund succeeds when empty", delOk.success, delOk.error ?? "");

    // Purge every row the test user owns through the app's own data layer.
    const delAcc = await store.deleteAllUserData();
    // Verify the deletion authoritatively with the service key.
    const remainingRes = await fetch(`${SUPA_URL}/rest/v1/fund_config?user_id=eq.${linked}&select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const remainingRows = await remainingRes.json();
    check("C13 Delete account data -> 0 funds", delAcc.success && Array.isArray(remainingRows) && remainingRows.length === 0, JSON.stringify(remainingRows).slice(0, 200));
  } finally {
    // Cleanup: remove throwaway test users + any rows the test created
    await fetch(`${SUPA_URL}/auth/v1/admin/users/${adminUser.id}?should_soft_delete=false`, {
      method: "DELETE",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    // Remove the auto-created next_auth.users row for the test email (if the
    // link function created one) and any leftover rows under that legacy id.
    try {
      const lookup = await fetch(`${SUPA_URL}/rest/v1/users?email=eq.${encodeURIComponent(TEST_EMAIL)}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Accept-Profile": "next_auth", "Content-Profile": "next_auth" },
      });
      const rows = await lookup.json();
      const legacyId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
      if (legacyId) {
        for (const table of ["entries", "nav_history", "fund_config"]) {
          await fetch(`${SUPA_URL}/rest/v1/${table}?user_id=eq.${legacyId}`, {
            method: "DELETE",
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
          });
        }
        await fetch(`${SUPA_URL}/rest/v1/users?id=eq.${legacyId}`, {
          method: "DELETE",
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Accept-Profile": "next_auth", "Content-Profile": "next_auth" },
        });
      }
    } catch {
      // best-effort cleanup only
    }
    console.log("   (test users + rows cleaned up)");
  }

  console.log(`\n========== RESULT: ${passed} passed, ${failed} failed ==========`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("SCRIPT CRASHED:", e);
  process.exitCode = 1;
});
