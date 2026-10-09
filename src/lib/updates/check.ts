// ============================================================
// SahakariSIP - In-app update check
// ============================================================
// Reads the single android row from public.app_releases (public read via
// RLS, anon key - the row holds only a version, notes and an APK URL) and
// compares it with this build's version. The update card component decides
// how loudly to nag based on the result.
// ============================================================

import Constants from "expo-constants";
import { SUPABASE_URL } from "../supabase";

export interface AppRelease {
  latest_version: string;
  apk_url: string;
  min_version: string | null;
  notes: string | null;
}

const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

// -1 if a < b, 0 if equal, 1 if a > b. Numeric per dot-separated part;
// missing parts count as 0, so 1.5 < 1.5.1.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export async function fetchLatestRelease(): Promise<AppRelease | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_releases?platform=eq.android&select=latest_version,apk_url,min_version,notes&limit=1`,
      {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as AppRelease[];
    const release = rows[0] ?? null;
    // An empty APK URL means "no release published yet".
    if (!release || !release.apk_url) return null;
    return release;
  } catch {
    return null;
  }
}
