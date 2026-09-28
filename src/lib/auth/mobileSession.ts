// ============================================================
// SahakariSIP — Mobile (NextAuth) session store
// ============================================================
// The APK authenticates through the WEB app (NextAuth + the shared
// bcrypt/OTP credential store). A finished sign-in yields one
// `MobileSession`: the next_auth identity plus a long-lived Supabase
// RLS JWT the web minted for us. That JWT rides as the Bearer token on
// every Supabase request (src/lib/supabase.ts wires it through the
// client's `accessToken` hook), so the phone and the browser share ONE
// identity: same user id, same portfolio, same data.
//
// Supabase-native Auth (auth.users / its refresh tokens / the
// sb-*-auth-token storage key) is intentionally gone — `getSupabase().auth`
// throws now by design, and TypeScript + the runtime both enforce it.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface MobileUser {
  /** next_auth.users.id — the same id the web app uses for its rows. */
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export interface MobileSession {
  user: MobileUser;
  /** Supabase RLS JWT (sub = user.id), signed by the web server. */
  accessToken: string;
  /** Unix ms when the JWT stops being valid. */
  expiresAt: number;
}

const SESSION_KEY = "sahakarisip.v1.mobile_session";

// In-memory mirror so the Supabase `accessToken` hook stays cheap and
// sync-ish on the hot path. "unloaded" distinguishes cold read from a
// confirmed miss.
let memory: MobileSession | null | "unloaded" = "unloaded";

function isValid(raw: unknown): raw is MobileSession {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Partial<MobileSession>;
  return (
    typeof s.accessToken === "string" &&
    s.accessToken.length > 20 &&
    typeof s.expiresAt === "number" &&
    !!s.user &&
    typeof s.user.id === "string"
  );
}

/** Live session or null; expired sessions self-evict from storage. */
export async function loadMobileSession(): Promise<MobileSession | null> {
  if (memory !== "unloaded") return memory;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed) && parsed.expiresAt > Date.now()) {
        memory = parsed;
        return parsed;
      }
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Corrupt entry → treat as signed out.
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
    } catch {
      // nothing else to do
    }
  }
  memory = null;
  return null;
}

export async function saveMobileSession(session: MobileSession): Promise<void> {
  memory = session;
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearMobileSession(): Promise<void> {
  memory = null;
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // already gone
  }
}

/** Bearer supplier for the Supabase client's `accessToken` hook. */
export async function getMobileBearer(): Promise<string | null> {
  const session = await loadMobileSession();
  return session?.accessToken ?? null;
}
