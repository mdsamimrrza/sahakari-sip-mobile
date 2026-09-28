// ============================================================
// SahakariSIP — One-time local → cloud merge
// ============================================================
// The phone is the source of truth; the cloud account is a copy
// that syncs once this merge runs. Triggered by AuthContext when a
// cloud session starts on a device that holds local data, AFTER the
// user confirms (MergePromptDialog) — never silently.
//
// Guarantees:
//   • Local keys are never modified — the phone keeps its exact
//     pre-merge data as the local-side backup.
//   • The cloud side is snapshotted to AsyncStorage before the first
//     write (backupCloudToLocal), so a bad merge is recoverable.
//   • Dedupe rules make a retry after partial failure safe:
//       funds   — matched case/trim-insensitively by fund_name
//       entries — (fund, purchase_date, amount); newest updated_at wins
//   • Writes go through CloudStore so the effective-user-id mapping
//     (Supabase Auth uid → web NextAuth id) applies automatically.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Entry,
  FundConfig,
  NavHistoryRow,
  NotificationPreferences,
} from "../types";
import { getSupabase } from "../supabase";
import { CloudStore } from "./cloud";
import type { CsvImportRow } from "./store";

const NS = "sahakarisip.v1";
const BACKUP_PREFIX = `${NS}.merge_backup.`;
const MERGE_DONE_PREFIX = `${NS}.merge_done.`;

/**
 * Remove the merge recovery snapshot and done markers for every profile.
 * Called by deleteAccount — nothing else in the app ever deletes these
 * keys, so they would otherwise outlive an "irreversibly purged" account.
 */
export async function purgeMergeArtifacts(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(
      (k) => k.startsWith(BACKUP_PREFIX) || k.startsWith(MERGE_DONE_PREFIX)
    );
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    // Best-effort — callers treat this as non-fatal cleanup.
  }
}

export interface LocalDataset {
  funds: FundConfig[];
  entries: Entry[];
  nav: NavHistoryRow[];
  prefs: NotificationPreferences | null;
}

/** What the merge-confirm dialog shows before anything is written. */
export interface MergeCounts {
  localFunds: number;
  localEntries: number;
  cloudFunds: number;
  cloudEntries: number;
}

export interface MergeResult {
  fundsAdded: number;
  fundsUpdated: number;
  entriesImported: number;
  duplicatesSkipped: number;
}

// ---------- Local device scan ----------

async function readJson<T>(k: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const localKey = {
  funds: (uid: string) => `${NS}.${uid}.funds`,
  entries: (uid: string) => `${NS}.${uid}.entries`,
  nav: (uid: string) => `${NS}.${uid}.nav_history`,
  prefs: (uid: string) => `${NS}.${uid}.prefs`,
};

/**
 * Every device-local profile whose storage holds data. Local keys are
 * namespaced `sahakarisip.v1.<profileId>.<entity>`, so scanning for the
 * entity suffixes finds each profile that ever saved something — including
 * profiles no longer in the auth profiles list.
 */
export async function listLocalDataUids(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  const uids = new Set<string>();
  const re = new RegExp(`^${NS}\\.(.+)\\.(entries|funds|nav_history)$`);
  for (const k of keys) {
    const m = re.exec(k);
    if (m) uids.add(m[1]);
  }
  return Array.from(uids);
}

export async function readLocalDataset(uid: string): Promise<LocalDataset> {
  const [funds, entries, nav, prefs] = await Promise.all([
    readJson<FundConfig[]>(localKey.funds(uid), []),
    readJson<Entry[]>(localKey.entries(uid), []),
    readJson<NavHistoryRow[]>(localKey.nav(uid), []),
    readJson<NotificationPreferences | null>(localKey.prefs(uid), null),
  ]);
  return { funds, entries, nav, prefs };
}

function hasMergeableData(ds: LocalDataset): boolean {
  return ds.funds.length > 0 || ds.entries.length > 0;
}

// ---------- Cloud reads (backup / dedup / counts) ----------

async function cloudUserIds(cloud: CloudStore): Promise<string[]> {
  const effectiveId = await cloud.getEffectiveUserId();
  if (!effectiveId) throw new Error("Not authenticated");
  const authId = await cloud.getUserId();
  return Array.from(
    new Set([effectiveId, authId].filter((x): x is string => !!x))
  ).map(requireSafeUserId);
}

/**
 * Restrict reads to the id this session owns. `cloudIds` may hold more
 * than one legacy id, but only the first is ever written to, and the
 * fields this merge filters on are all `|`-joined composite keys — so a
 * user id containing `|` would let a crafted id prefix-match another
 * user's key. Reject it before it reaches a Map lookup.
 */
function requireSafeUserId(id: string | undefined): string {
  if (!id) throw new Error("Not authenticated");
  if (id.includes("|")) throw new Error("Unsupported account identifier");
  return id;
}

async function readCloudRows<T>(
  table: string,
  userIds: string[],
  select = "*"
): Promise<T[]> {
  const { data, error } = await getSupabase()
    .from(table)
    .select(select)
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * Snapshot the cloud side to AsyncStorage before the merge touches it.
 * Returns the backup key. The local side needs no snapshot — the merge
 * never writes to local keys.
 */
export async function backupCloudToLocal(cloud: CloudStore): Promise<string> {
  const ids = await cloudUserIds(cloud);
  const [funds, entries, prefs] = await Promise.all([
    readCloudRows<FundConfig>("fund_config", ids),
    readCloudRows<Entry>("entries", ids),
    readCloudPrefs(ids),
  ]);
  const effectiveId = await cloud.getEffectiveUserId();
  const key = `${BACKUP_PREFIX}${effectiveId}`;
  await AsyncStorage.setItem(
    key,
    JSON.stringify({ saved_at: new Date().toISOString(), funds, entries, prefs })
  );
  return key;
}

async function readCloudPrefs(
  userIds: string[]
): Promise<NotificationPreferences | null> {
  try {
    const { data, error } = await getSupabase()
      .from("notification_preferences")
      .select("push_enabled, email_enabled, reminder_day, notify_days_before")
      .in("user_id", userIds)
      .limit(1);
    if (error) return null;
    return (data?.[0] as NotificationPreferences) ?? null;
  } catch {
    return null;
  }
}

export async function countCloudData(
  cloud: CloudStore
): Promise<{ funds: number; entries: number }> {
  const ids = await cloudUserIds(cloud);
  const [funds, entries] = await Promise.all([
    readCloudRows<FundConfig>("fund_config", ids, "id"),
    readCloudRows<Entry>("entries", ids, "id"),
  ]);
  return { funds: funds.length, entries: entries.length };
}

/**
 * Decide whether the one-time merge should be offered for this cloud
 * session: is there device data whose profile hasn't been merged into
 * this account yet? Returns null when there's nothing to offer.
 */
export async function inspectMergeCandidate(
  cloud: CloudStore
): Promise<MergeCounts | null> {
  const ids = await cloudUserIds(cloud);

  const uids = await listLocalDataUids();
  let localFunds = 0;
  let localEntries = 0;
  let pending = false;
  for (const uid of uids) {
    // Per-(account, profile) marker set on successful merge. Local keys
    // stay after a merge, so without this we'd re-offer on every launch.
    const done = await AsyncStorage.getItem(`${MERGE_DONE_PREFIX}${ids[0]}.${uid}`);
    if (done) continue;
    const ds = await readLocalDataset(uid);
    if (!hasMergeableData(ds)) continue;
    pending = true;
    localFunds += ds.funds.length;
    localEntries += ds.entries.length;
  }
  if (!pending) return null;

  const cloudCounts = await countCloudData(cloud);
  return {
    localFunds,
    localEntries,
    cloudFunds: cloudCounts.funds,
    cloudEntries: cloudCounts.entries,
  };
}

/**
 * Lightweight check for the Settings "Go Cloud" card: does this cloud
 * account still have device data that hasn't been merged? Local-only scan
 * (no cloud round trip beyond the cached effective-id lookup), so it's
 * cheap enough to run on every settings focus.
 */
export async function hasUnmergedLocalData(cloud: CloudStore): Promise<boolean> {
  const effectiveId = await cloud.getEffectiveUserId();
  if (!effectiveId) return false;
  const uids = await listLocalDataUids();
  for (const uid of uids) {
    const done = await AsyncStorage.getItem(`${MERGE_DONE_PREFIX}${effectiveId}.${uid}`);
    if (done) continue;
    const ds = await readLocalDataset(uid);
    if (hasMergeableData(ds)) return true;
  }
  return false;
}

// ---------- The merge itself ----------

const fundKey = (userId: string, name: string) => `${userId}|${name.trim().toLowerCase()}`;

/** Owning user id of a `fundKey` — the prefix before the first `|`. */
const keyUserId = (key: string) => key.slice(0, key.indexOf("|"));

/** Resolve a local fund id to its name from the dataset. */
function fundNameForLocalId(ds: LocalDataset, fundId: string): string {
  const f = ds.funds.find((f) => f.id === fundId);
  return f ? f.fund_name.trim().toLowerCase() : fundId;
}

/**
 * ISO-timestamp "is a newer than b". Local timestamps come from the device
 * clock (toISOString), cloud ones from Postgres — formats differ slightly
 * in the sub-second suffix, so equal-to-the-second comparisons lean
 * conservative (cloud kept). Good enough for newest-edit-wins.
 */
function isNewer(a?: string | null, b?: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  return a > b;
}

export async function mergeLocalIntoCloud(
  cloud: CloudStore
): Promise<MergeResult> {
  const cloudIds = await cloudUserIds(cloud);
  const result: MergeResult = {
    fundsAdded: 0,
    fundsUpdated: 0,
    entriesImported: 0,
    duplicatesSkipped: 0,
  };

  // Cloud entries already on record — the dedupe key set. Grows as we
  // push, so two device profiles holding the same entry don't both import.
  // Keyed by fund NAME, not fund_id: the read set can span legacy id
  // spaces whose fund ids differ while the portfolio is the same, and an
  // id-based key would re-import the same purchase under each id.
  const cloudEntries = await readCloudRows<Entry>("entries", cloudIds);
  const cloudFundNames = new Map<string, string>();
  for (const f of await readCloudRows<FundConfig>("fund_config", cloudIds, "id, fund_name")) {
    cloudFundNames.set(f.id, f.fund_name.trim().toLowerCase());
  }
  const seenEntries = new Set(
    cloudEntries.map(
      (e) =>
        `${cloudFundNames.get(e.fund_id) ?? e.fund_id}|${e.purchase_date}|${Number(e.amount)}`
    )
  );

  // Cloud funds by name — grows as we create, so two device profiles with
  // the same fund name share one cloud fund.
  // Key includes cloud user ID to prevent cross-user collisions.
  const effectiveUserId = requireSafeUserId(cloudIds[0]);
  const cloudFunds = await readCloudRows<FundConfig>("fund_config", cloudIds);
  const fundsByName = new Map<string, FundConfig>();
  for (const f of cloudFunds) fundsByName.set(fundKey(effectiveUserId, f.fund_name), f);

  const uids = await listLocalDataUids();

  for (const uid of uids) {
    const ds = await readLocalDataset(uid);
    if (!hasMergeableData(ds)) continue;

    // 1. Funds first — entries can't be written until their fund exists.
    const fundIdMap = new Map<string, string>();
    const newestEntryDate = new Map<string, string>();

    for (const localFund of ds.funds) {
      const name = fundKey(effectiveUserId, localFund.fund_name);
      const existing = fundsByName.get(name);

      // A legacy id in the read set can surface a fund whose key belongs to
      // a different id space. Adopt it for id remapping only — never write
      // through it, or the merge would mutate rows this session doesn't own.
      const owned = existing ? keyUserId(name) === effectiveUserId : false;

      if (existing && owned) {
        fundIdMap.set(localFund.id, existing.id);
        if (isNewer(localFund.updated_at, existing.updated_at)) {
          const updated = await cloud.updateFundConfig(existing.id, {
            fund_name: localFund.fund_name,
            fee_rate_pct: Number(localFund.fee_rate_pct) || 0,
            start_date: localFund.start_date,
            monthly_sip: Number(localFund.monthly_sip) || 0,
            latest_nav: navForFund(ds, localFund),
          });
          if (!updated.success || !updated.data) {
            throw new Error(updated.error ?? "Fund update failed");
          }
          fundsByName.set(name, updated.data);
          result.fundsUpdated++;
        }
        continue;
      }

      // Already reachable under a legacy id: point entries at it and leave
      // the cloud row untouched.
      if (existing) {
        fundIdMap.set(localFund.id, existing.id);
        continue;
      }

      // fundConfigSchema requires a positive NAV — fall back to the
      // fund's NAV history, then its newest entry, then skip the fund
      // (its entries are counted as skipped below).
      const nav = navForFund(ds, localFund);
      if (!(nav > 0)) continue;

      const created = await cloud.createFundConfig({
        fund_name: localFund.fund_name,
        fee_rate_pct: Number(localFund.fee_rate_pct) || 0,
        start_date: localFund.start_date,
        monthly_sip: Number(localFund.monthly_sip) || 0,
        latest_nav: nav,
      });
      if (!created.success || !created.data) {
        throw new Error(created.error ?? "Fund creation failed");
      }
      fundsByName.set(name, created.data);
      fundIdMap.set(localFund.id, created.data.id);
      result.fundsAdded++;
    }

    // 2. Entries — remap fund ids, drop duplicates, bulk-import per fund
    // via the CSV path (it handles nav_history upserts + latest_nav).
    const rowsByCloudFund = new Map<string, CsvImportRow[]>();
    const nameByCloudFund = new Map<string, string>();
    for (const entry of ds.entries) {
      const cloudFundId = fundIdMap.get(entry.fund_id);
      if (!cloudFundId) {
        // Fund missing locally (or skipped above) — nowhere to place it.
        result.duplicatesSkipped++;
        continue;
      }
      const cloudFundName =
        nameByCloudFund.get(cloudFundId) ??
        cloudFundNames.get(cloudFundId) ??
        fundNameForLocalId(ds, entry.fund_id);
      nameByCloudFund.set(cloudFundId, cloudFundName);
      const dedupeKey = `${cloudFundName}|${entry.purchase_date}|${Number(entry.amount)}`;
      if (seenEntries.has(dedupeKey)) {
        result.duplicatesSkipped++;
        continue;
      }
      seenEntries.add(dedupeKey);
      const rows = rowsByCloudFund.get(cloudFundId) ?? [];
      rows.push({
        date: entry.purchase_date,
        amount: Number(entry.amount),
        nav: Number(entry.nav),
        units: Number(entry.units) || undefined,
        notes: entry.notes ?? undefined,
      });
      rowsByCloudFund.set(cloudFundId, rows);
      const prev = newestEntryDate.get(cloudFundId);
      if (!prev || entry.purchase_date > prev) {
        newestEntryDate.set(cloudFundId, entry.purchase_date);
      }
    }

    for (const [cloudFundId, rows] of rowsByCloudFund) {
      const imported = await cloud.importEntriesFromCsv(cloudFundId, rows);
      if (!imported.success) {
        throw new Error(imported.error ?? "Entry import failed");
      }
      result.entriesImported += imported.data?.imported ?? 0;
      result.duplicatesSkipped += imported.data?.skipped ?? 0;
    }

    // 3. Newest standalone NAV per fund (manual Latest-NAV edits no entry
    // covers). Only pushed when genuinely newer than the cloud already
    // has, so we never drag a price backwards.
    for (const localFund of ds.funds) {
      const cloudFundId = fundIdMap.get(localFund.id);
      if (!cloudFundId) continue;
      const rows = ds.nav.filter((r) => r.fund_id === localFund.id);
      if (rows.length === 0) continue;
      const newest = rows.reduce((a, b) => (b.nav_date > a.nav_date ? b : a));
      const cloudFund = fundsByName.get(fundKey(effectiveUserId, localFund.fund_name));
      const floor =
        newestEntryDate.get(cloudFundId) ?? cloudFund?.latest_nav_date ?? "";
      if (newest.nav_date > floor) {
        const res = await cloud.updateLatestNav({
          fund_id: cloudFundId,
          latest_nav: Number(newest.nav_value),
          latest_nav_date: newest.nav_date,
        });
        if (!res.success) {
          throw new Error(res.error ?? "NAV update failed");
        }
      }
    }

    // 4. Preferences — device being migrated wins (no timestamps exist).
    if (ds.prefs) {
      const res = await cloud.saveNotificationPreferences(ds.prefs);
      if (!res.success) {
        throw new Error(res.error ?? "Preference sync failed");
      }
    }

    // Mark this device profile as merged. Local keys stay untouched —
    // they remain the phone-side backup of the pre-merge data.
    await AsyncStorage.setItem(
      `${MERGE_DONE_PREFIX}${cloudIds[0]}.${uid}`,
      new Date().toISOString()
    );
  }

  return result;
}

/** Best NAV for a local fund: its own latest_nav, else newest NAV-history
 * row, else newest entry's NAV. Returns 0 when the fund has none. */
function navForFund(ds: LocalDataset, fund: FundConfig): number {
  if (Number(fund.latest_nav) > 0) return Number(fund.latest_nav);
  const navRows = ds.nav
    .filter((r) => r.fund_id === fund.id)
    .sort((a, b) => (a.nav_date < b.nav_date ? 1 : -1));
  if (navRows[0] && Number(navRows[0].nav_value) > 0) {
    return Number(navRows[0].nav_value);
  }
  const entryNavs = ds.entries
    .filter((e) => e.fund_id === fund.id)
    .sort((a, b) => (a.purchase_date < b.purchase_date ? 1 : -1));
  if (entryNavs[0] && Number(entryNavs[0].nav) > 0) {
    return Number(entryNavs[0].nav);
  }
  return 0;
}
