// ============================================================
// SahakariSIP — Auth Provider
// ============================================================
// The web app authenticates with NextAuth v5 (credentials + Google)
// backed by bcrypt hashes stored server-side. A mobile bundle can't run
// that server code, so the mobile app offers the two equivalent routes:
//
//   1. CLOUD  — Supabase Auth email + password. Same Supabase project and
//               the same fund_config/entries/nav_history tables as the web
//               app, with Row Level Security isolating each account.
//   2. DEVICE — an on-device profile (salted SHA-256 hash, never leaves the
//               phone). Everything works offline; the portfolio lives in
//               local storage only.
//
// Both routes expose an identical `DataStore`, so every screen behaves
// the same way regardless of which one the user picked.
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { getSupabase, isSupabaseConfigured } from "../supabase";
import { createStore } from "../data";
import type { DataMode, DataStore } from "../data/store";
import { uuid } from "../utils";

export interface AppUser {
  id: string;
  email: string;
  name?: string;
  mode: DataMode;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  /** Set when signup succeeded but the account still needs email confirmation. */
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AppUser | null;
  store: DataStore | null;
  dataMode: DataMode;
  cloudAvailable: boolean;
  sessionStartedAt: string | null;
  signIn: (email: string, password: string, mode: DataMode) => Promise<AuthResult>;
  signInWithGoogle: (mode: DataMode) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    confirmPassword: string,
    mode: DataMode
  ) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<AuthResult>;
  requestPasswordReset: (email: string, mode: DataMode) => Promise<AuthResult>;
  verifyPasswordResetOtp: (
    email: string,
    code: string,
    mode: DataMode
  ) => Promise<AuthResult>;
  completePasswordReset: (newPassword: string, mode: DataMode) => Promise<AuthResult>;
}

const SESSION_KEY = "sahakarisip.v1.session";
const PROFILES_KEY = "sahakarisip.v1.profiles";
const SESSION_STARTED_KEY = "sahakarisip.v1.session_started_at";

interface LocalProfile {
  id: string;
  email: string;
  name?: string;
  salt: string;
  hash: string;
  created_at: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------- Local profile helpers ----------

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}::${password}`
  );
}

async function readProfiles(): Promise<LocalProfile[]> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    return raw ? (JSON.parse(raw) as LocalProfile[]) : [];
  } catch {
    return [];
  }
}

async function writeProfiles(profiles: LocalProfile[]): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<AppUser | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const mounted = useRef(true);

  const cloudAvailable = isSupabaseConfigured;

  const persistSession = useCallback(async (next: AppUser | null) => {
    if (next) {
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
      const startedAt = new Date().toISOString();
      await AsyncStorage.setItem(SESSION_STARTED_KEY, startedAt);
      setSessionStartedAt(startedAt);
    } else {
      await AsyncStorage.removeItem(SESSION_KEY);
      await AsyncStorage.removeItem(SESSION_STARTED_KEY);
      setSessionStartedAt(null);
    }
    setUser(next);
    setStatus(next ? "authenticated" : "unauthenticated");
  }, []);

  // ---------- Bootstrap ----------

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        // 1. Restore a cloud session if Supabase has one persisted
        if (cloudAvailable) {
          const { data } = await getSupabase().auth.getSession();
          const supaUser = data.session?.user;
          if (supaUser?.email) {
            const next: AppUser = {
              id: supaUser.id,
              email: supaUser.email,
              name: (supaUser.user_metadata?.name as string) || undefined,
              mode: "cloud",
            };
            const startedAt = await AsyncStorage.getItem(SESSION_STARTED_KEY);
            await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
            if (!startedAt) {
              const now = new Date().toISOString();
              await AsyncStorage.setItem(SESSION_STARTED_KEY, now);
              setSessionStartedAt(now);
            } else {
              setSessionStartedAt(startedAt);
            }
            if (mounted.current) {
              setUser(next);
              setStatus("authenticated");
            }
            return;
          }
        }

        // 2. Otherwise restore a device-local session
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as AppUser;
          if (saved.mode === "local") {
            const startedAt = await AsyncStorage.getItem(SESSION_STARTED_KEY);
            if (mounted.current) {
              setUser(saved);
              setSessionStartedAt(startedAt);
              setStatus("authenticated");
            }
            return;
          }
        }

        if (mounted.current) setStatus("unauthenticated");
      } catch {
        if (mounted.current) setStatus("unauthenticated");
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [cloudAvailable]);

  // ---------- Sign in ----------

  const signIn = useCallback(
    async (
      email: string,
      password: string,
      mode: DataMode
    ): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();

      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        const { data, error } = await getSupabase().auth.signInWithPassword({
          email: normalized,
          password,
        });
        if (error) {
          const msg = /confirm/i.test(error.message)
            ? "Please confirm your email address before signing in."
            : "Invalid email or password. Please try again.";
          return { success: false, error: msg };
        }
        if (!data.user?.email) {
          return { success: false, error: "Sign in failed. Please try again." };
        }
        await persistSession({
          id: data.user.id,
          email: data.user.email,
          name: (data.user.user_metadata?.name as string) || undefined,
          mode: "cloud",
        });
        return { success: true };
      }

      // ---- Device-local mode ----
      const profiles = await readProfiles();
      const profile = profiles.find((p) => p.email === normalized);
      if (!profile) {
        return { success: false, error: "No on-device profile found for this email. Create one first." };
      }
      const hash = await hashPassword(password, profile.salt);
      if (hash !== profile.hash) {
        return { success: false, error: "Invalid email or password. Please try again." };
      }
      await persistSession({
        id: profile.id,
        email: profile.email,
        name: profile.name,
        mode: "local",
      });
      return { success: true };
    },
    [cloudAvailable, persistSession]
  );

  // ---------- Sign up ----------

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      confirmPassword: string,
      mode: DataMode
    ): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();

      if (password.length < 8) {
        return { success: false, error: "Password must be at least 8 characters." };
      }
      if (password !== confirmPassword) {
        return { success: false, error: "Passwords do not match." };
      }

      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        const { data, error } = await getSupabase().auth.signUp({
          email: normalized,
          password,
        });
        if (error) return { success: false, error: error.message };

        // When email confirmation is enabled Supabase returns a user but no
        // session — surface that instead of pretending we're signed in.
        if (!data.session) {
          return { success: true, needsEmailConfirmation: true };
        }
        if (data.user?.email) {
          await persistSession({
            id: data.user.id,
            email: data.user.email,
            mode: "cloud",
          });
        }
        return { success: true };
      }

      // ---- Device-local mode ----
      const profiles = await readProfiles();
      if (profiles.some((p) => p.email === normalized)) {
        return {
          success: false,
          error: "An on-device profile with this email already exists. Please sign in.",
        };
      }
      const salt = uuid();
      const hash = await hashPassword(password, salt);
      const profile: LocalProfile = {
        id: uuid(),
        email: normalized,
        salt,
        hash,
        created_at: new Date().toISOString(),
      };
      await writeProfiles([...profiles, profile]);
      await persistSession({
        id: profile.id,
        email: profile.email,
        mode: "local",
      });
      return { success: true };
    },
    [cloudAvailable, persistSession]
  );

    // ---------- Google sign-in ----------

  const signInWithGoogle = useCallback(
    async (mode: DataMode): Promise<AuthResult> => {
      if (!cloudAvailable) {
        return {
          success: false,
          error: "Google sign-in requires cloud mode. Configure Supabase or use email + password.",
        };
      }
      if (mode !== "cloud") {
        return {
          success: false,
          error: "Google sign-in is only available in cloud mode. Switch the toggle above.",
        };
      }

      try {
        // PKCE browser flow: Supabase hands us the consent URL, the OS
        // browser session opens it, and the redirect lands back in the app.
        const redirectTo = Linking.createURL("/auth/callback");
        const { data, error } = await getSupabase().auth.signInWithOAuth({
          provider: "google",
          options: { skipBrowserRedirect: true, redirectTo },
        });
        if (error) return { success: false, error: error.message };
        if (!data?.url) {
          return { success: false, error: "Could not start Google sign-in. Please try again." };
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success" || !("url" in result) || !result.url) {
          return {
            success: false,
            error: "Google sign-in was cancelled or failed. Please try again.",
          };
        }

        // Exchange the PKCE code from the redirect for a session.
        const code = result.url.match(/[?&]code=([^&]+)/)?.[1];
        if (code) {
          const { error: exchangeError } =
            await getSupabase().auth.exchangeCodeForSession(code);
          if (exchangeError) {
            return { success: false, error: exchangeError.message };
          }
        }

        const { data: sess } = await getSupabase().auth.getSession();
        const supaUser = sess.session?.user;
        if (!supaUser?.email) {
          return {
            success: false,
            error: "Google sign-in was cancelled or failed. Please try again.",
          };
        }

        await persistSession({
          id: supaUser.id,
          email: supaUser.email,
          name: (supaUser.user_metadata?.name as string) || undefined,
          mode: "cloud",
        });
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error:
            e instanceof Error
              ? e.message
              : "Google sign-in was cancelled or failed. Please try again.",
        };
      }
    },
    [cloudAvailable, persistSession]
  );

  // ---------- Sign out ----------

  const signOut = useCallback(async () => {
    try {
      if (cloudAvailable) {
        await getSupabase().auth.signOut();
      }
    } catch {
      // ignore — clearing the local session below is what matters
    }
    await persistSession(null);
  }, [cloudAvailable, persistSession]);

  // ---------- Delete account ----------

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    if (!user) return { success: false, error: "Not authenticated" };
    const activeStore = createStore(user.mode, user.id);
    const res = await activeStore.deleteAllUserData();
    if (!res.success) return { success: false, error: res.error };

    if (user.mode === "local") {
      const profiles = await readProfiles();
      await writeProfiles(profiles.filter((p) => p.id !== user.id));
    }

    await persistSession(null);
    return { success: true };
  }, [persistSession, user]);

  // ---------- Password reset ----------

  const requestPasswordReset = useCallback(
    async (email: string, mode: DataMode): Promise<AuthResult> => {
      const normalized = email.toLowerCase().trim();
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        const { error } = await getSupabase().auth.resetPasswordForEmail(
          normalized
        );
        if (error) return { success: false, error: error.message };
        return { success: true };
      }

      // Device-local profiles have no email channel — the honest answer is
      // that the password cannot be recovered, so we say so.
      const profiles = await readProfiles();
      const exists = profiles.some((p) => p.email === normalized);
      return {
        success: false,
        error: exists
          ? "On-device profiles can't be recovered by email. Create a new profile instead."
          : "No on-device profile found for this email.",
      };
    },
    [cloudAvailable]
  );

  /** Step 2 of the web's 3-step reset flow: verify the 6-digit code. */
  const verifyPasswordResetOtp = useCallback(
    async (email: string, code: string, mode: DataMode): Promise<AuthResult> => {
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        const { data, error } = await getSupabase().auth.verifyOtp({
          email: email.toLowerCase().trim(),
          token: code,
          type: "recovery",
        });
        if (error) {
          const msg = /expire/i.test(error.message)
            ? "OTP code expired or invalid. Please request a new one."
            : "Incorrect OTP code. Please try again.";
          return { success: false, error: msg };
        }
        if (!data.session) {
          return {
            success: false,
            error: "Invalid or expired reset session. Please start over.",
          };
        }
        return { success: true };
      }

      return {
        success: false,
        error: "On-device profiles can't be recovered by email. Create a new profile instead.",
      };
    },
    [cloudAvailable]
  );

  /** Step 3 of the web's 3-step reset flow: set the new password. */
  const completePasswordReset = useCallback(
    async (newPassword: string, mode: DataMode): Promise<AuthResult> => {
      if (mode === "cloud") {
        if (!cloudAvailable) {
          return { success: false, error: "Cloud mode is not configured." };
        }
        if (newPassword.length < 8) {
          return { success: false, error: "Password must be at least 8 characters." };
        }
        const { data, error } = await getSupabase().auth.updateUser({
          password: newPassword,
        });
        if (error) {
          return {
            success: false,
            error: /session/i.test(error.message)
              ? "Invalid or expired reset session. Please start over."
              : error.message,
          };
        }
        if (data.user?.email) {
          await persistSession({
            id: data.user.id,
            email: data.user.email,
            name: (data.user.user_metadata?.name as string) || undefined,
            mode: "cloud",
          });
        }
        return { success: true };
      }

      return {
        success: false,
        error: "On-device profiles can't be recovered by email. Create a new profile instead.",
      };
    },
    [cloudAvailable, persistSession]
  );

  const store = useMemo(
    () => (user ? createStore(user.mode, user.id) : null),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      store,
      dataMode: user?.mode ?? "local",
      cloudAvailable,
      sessionStartedAt,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      deleteAccount,
      requestPasswordReset,
      verifyPasswordResetOtp,
      completePasswordReset,
    }),
    [
      status,
      user,
      store,
      cloudAvailable,
      sessionStartedAt,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      deleteAccount,
      requestPasswordReset,
      verifyPasswordResetOtp,
      completePasswordReset,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
