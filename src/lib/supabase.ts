// ============================================================
// SahakariSIP — Supabase Client (React Native)
// ============================================================
// Uses the *anon* key only. The web app's server actions run with the
// service-role key, which must never be shipped inside a mobile bundle —
// here every request is made as the signed-in user, so Postgres Row Level
// Security ("next_auth.uid() = user_id") is what isolates each portfolio.
//
// Identity model (since the NextAuth migration): the APK signs in
// THROUGH THE WEB APP (Google handoff / shared bcrypt credentials). A
// finished sign-in yields a long-lived RLS JWT minted by the web server
// (src/lib/auth/mobileSession.ts); the `accessToken` hook below injects
// it as the Bearer token on every request, so the phone and the browser
// are the SAME user id — one account, one portfolio, everywhere.
//
// supabase-js's own auth namespace is deliberately off (the accessToken
// option replaces it with a throwing proxy): there is no Supabase-native
// session in this app anymore, by design.
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

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMobileBearer } from "./auth/mobileSession";

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;

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
      // Every REST/storage call carries the NextAuth-minted RLS JWT as
      // its Bearer token (null when signed out → PostgREST rejects with
      // 401, which the stores surface as "Not authenticated").
      accessToken: () => getMobileBearer(),
    });
  }
  return client;
}
