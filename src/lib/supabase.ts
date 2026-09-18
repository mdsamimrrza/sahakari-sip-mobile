// ============================================================
// SahakariSIP — Supabase Client (React Native)
// ============================================================
// Uses the *anon* key only. The web app's server actions run with the
// service-role key, which must never be shipped inside a mobile bundle —
// here every request is made as the signed-in user, so Postgres Row Level
// Security ("auth.uid() = user_id") is what isolates each portfolio.
// ============================================================

// The URL polyfill must run inside the React Native runtime (older Hermes
// versions lack a WHATWG URL). Plain Node scripts (e.g. _verify/verify.test.ts)
// cannot import react-native at all, so the polyfill is applied lazily and
// guarded — Node's own URL is already WHATWG-compliant.
let urlPolyfillApplied = false;
function applyUrlPolyfill() {
  if (urlPolyfillApplied) return;
  urlPolyfillApplied = true;
  try {
    require("react-native-url-polyfill/auto");
  } catch {
    // Not in a React Native runtime — native URL is fine.
  }
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 40;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env"
    );
  }
  if (!client) {
    applyUrlPolyfill();
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
