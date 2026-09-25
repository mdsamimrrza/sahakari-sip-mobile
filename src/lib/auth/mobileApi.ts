// ============================================================
// SahakariSIP - Mobile API client (web NextAuth backend)
// ============================================================
// Thin fetch wrapper over the web app's /api/mobile/* routes (see
// sahakari-sip repo). Every cloud-mode auth operation goes through
// this file; the web owns Google OAuth, the bcrypt credential store,
// OTP email delivery, and minting the Supabase RLS JWT.
// ============================================================

import { getRandomBytes } from "expo-crypto";
import type { MobileUser } from "./mobileSession";

const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL || "https://sahakari-sip.vercel.app"
)
  .trim()
  .replace(/\/+$/, "");

export const isWebConfigured = WEB_URL.startsWith("https://");

function apiUrl(path: string): string {
  return `${WEB_URL}/api/mobile${path}`;
}

export class MobileApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; bearer?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? "POST",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new MobileApiError("Network unreachable. Check your connection.", 0);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // non-JSON error body (proxy/5xx) - fall through with {}
  }

  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : res.statusText;
    throw new MobileApiError(msg, res.status);
  }
  return data as T;
}

/** POST response shapes */
interface SessionResponse {
  user: MobileUser;
  access_token: string;
  expires_in: number;
}

function toSession(r: SessionResponse): { user: MobileUser; accessToken: string; expiresAt: number } {
  return {
    user: r.user,
    accessToken: r.access_token,
    expiresAt: Date.now() + r.expires_in * 1000,
  };
}

// ---------- Google handoff (web browser flow - kept as fallback) ----------

/**
 * Ask the web where to start Google sign-in. We mint the nonce here -
 * 32 hex chars - so only this device knows the value that will come
 * back through the sahakarisip:// redirect.
 */
export async function googleStart(redirectUrl?: string): Promise<{ url: string; nonce: string }> {
  const bytes = getRandomBytes(16);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const res = await request<{ url: string; nonce: string }>("/google", {
    body: { nonce, redirectUrl },
  });
  return { url: res.url, nonce: res.nonce };
}

/** Turn a handoff token captured from the redirect into a session. */
export async function googleExchange(nonce: string) {
  const res = await request<SessionResponse>("/exchange", { body: { nonce } });
  return toSession(res);
}

// ---------- Google native sign-in (no browser, native account picker) ----------

/**
 * Exchange a Google ID token (from @react-native-google-signin/google-signin)
 * for a SahakariSIP session. The server verifies the token with Google,
 * finds or creates the next_auth user, and returns the Supabase RLS JWT.
 */
export async function googleNativeSignIn(idToken: string) {
  const res = await request<SessionResponse>("/google-native", {
    body: { idToken },
  });
  return toSession(res);
}

// ---------- Email + password ----------

export async function passwordLogin(email: string, password: string) {
  const res = await request<SessionResponse>("/password-login", {
    body: { email, password },
  });
  return toSession(res);
}

export async function signup(email: string, password: string, confirmPassword: string) {
  await request<{ success: boolean; needsEmailConfirmation: boolean }>("/signup", {
    body: { email, password, confirmPassword },
  });
}

/** Confirm the emailed code; returns a session when the account activates. */
export async function signupVerify(
  email: string,
  code: string
): Promise<ReturnType<typeof toSession> | null> {
  const res = await request<Partial<SessionResponse>>("/signup", {
    method: "PUT",
    body: { email, code },
  });
  return res.access_token ? toSession(res as SessionResponse) : null;
}

// ---------- Password reset (3-step OTP) ----------

export async function requestPasswordReset(email: string) {
  await request<{ success: boolean }>("/password-reset", { body: { email } });
}

export async function verifyResetOtp(email: string, code: string): Promise<{ success: boolean; resetToken?: string; email?: string }> {
  const res = await request<{ success: boolean; resetToken?: string; email?: string }>("/password-reset", {
    method: "PUT",
    body: { email, code },
  });
  if (!res.resetToken) throw new MobileApiError("Reset session invalid. Please start over.", 400);
  return res;
}

export async function completeReset(
  email: string,
  resetToken: string,
  newPassword: string,
  confirmPassword: string
) {
  await request<{ success: boolean }>("/password-reset", {
    method: "PATCH",
    body: { email, resetToken, newPassword, confirmPassword },
  });
}

// ---------- Account ----------

/** Re-pull the web-side identity (name/image) with the bearer token. */
export async function fetchProfile(bearer: string): Promise<MobileUser | null> {
  try {
    const res = await request<{ user: MobileUser }>("/account", {
      method: "GET",
      bearer,
    });
    return res.user ?? null;
  } catch {
    return null;
  }
}

export async function deleteAccount(bearer: string) {
  await request<{ success: boolean }>("/account", { method: "DELETE", bearer });
}
