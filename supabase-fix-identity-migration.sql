-- ============================================================
-- SahakariSIP - FIX: identity mapping for the post-NextAuth backend
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL Editor ->
-- New query). Idempotent - safe to re-run.
--
-- THE PROBLEM (regression of existing-user login, mobile only)
--   The web backend migrated off NextAuth to its own identity system:
--   user_passwords / otp_tokens hold the accounts, app_user_links maps
--   each Supabase Auth uid (supa_user_id) to the LEGACY id that owns all
--   data rows (fund_config / entries / nav_history). The web app reads
--   with the service-role key (RLS bypassed), so it always worked.
--   The APK queries with the anon key + the backend's RLS JWT, so it
--   depends on app_effective_user_id() translating the JWT identity to
--   the legacy id. The old function only mapped via next_auth.users -
--   dead after the migration - so it fell back to the raw auth uid,
--   which owns no rows. RLS then silently returns an EMPTY result
--   (HTTP 200, zero rows), and the app drops every existing user into
--   the "No fund yet" / fund-registration flow. No error is shown.
--
-- THE FIX
--   Resolve the effective id through app_user_links FIRST (the current
--   system), keep the next_auth email mapping as a legacy fallback, and
--   only then fall back to auth.uid(). Works for JWTs minted with
--   either id space, for reads AND writes (USING + WITH CHECK).
-- ============================================================

-- ---------- 1. Effective user id: link table first, then email ----------

CREATE OR REPLACE FUNCTION public.app_effective_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
  SELECT COALESCE(
    -- Current identity system: Supabase Auth uid -> legacy data owner.
    (SELECT l.legacy_user_id
       FROM public.app_user_links l
      WHERE l.supa_user_id = auth.uid()
      LIMIT 1),
    -- Legacy NextAuth mapping by CONFIRMED email (pre-migration JWTs).
    (SELECT nu.id
       FROM next_auth.users nu
      WHERE nu.email = (
        SELECT au.email FROM auth.users au
         WHERE au.id = auth.uid()
           AND au.email_confirmed_at IS NOT NULL
      )
      LIMIT 1),
    auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_effective_user_id() TO authenticated;

-- ---------- 2. Re-assert the policies that use the effective id ----------
-- (Idempotent; guarantees the tenant tables really reference the function
--  even if an earlier script run stopped partway.)

DROP POLICY IF EXISTS "users manage own fund_config" ON public.fund_config;
CREATE POLICY "users manage own fund_config"
  ON public.fund_config FOR ALL
  USING (user_id = public.app_effective_user_id())
  WITH CHECK (user_id = public.app_effective_user_id());

DROP POLICY IF EXISTS "users manage own entries" ON public.entries;
CREATE POLICY "users manage own entries"
  ON public.entries FOR ALL
  USING (user_id = public.app_effective_user_id())
  WITH CHECK (user_id = public.app_effective_user_id());

DROP POLICY IF EXISTS "users manage own nav_history" ON public.nav_history;
CREATE POLICY "users manage own nav_history"
  ON public.nav_history FOR ALL
  USING (user_id = public.app_effective_user_id())
  WITH CHECK (user_id = public.app_effective_user_id());

DROP POLICY IF EXISTS "users manage own notification_preferences" ON public.notification_preferences;
CREATE POLICY "users manage own notification_preferences"
  ON public.notification_preferences FOR ALL
  USING (user_id = public.app_effective_user_id())
  WITH CHECK (user_id = public.app_effective_user_id());

DROP POLICY IF EXISTS "users manage own notifications_log" ON public.notifications_log;
CREATE POLICY "users manage own notifications_log"
  ON public.notifications_log FOR ALL
  USING (user_id = public.app_effective_user_id())
  WITH CHECK (user_id = public.app_effective_user_id());

-- ---------- 3. Verify (read-only, run in the same editor) ----------
-- a) Both accounts must appear once, mapped supa -> legacy:
--    SELECT supa_user_id, legacy_user_id FROM public.app_user_links;
--
-- b) Sanity: the function must resolve WITHOUT relying on next_auth.
--    In the SQL editor (no JWT) this returns NULL - that is expected.
--    The real test is the app: force-close, reopen, log in.
--    The dashboard must show the existing funds immediately.
--
-- c) If it still comes back empty, check the JWT sub the backend mints:
--    EMAIL=... PASSWORD=... node _verify/verify-mobile-auth.mjs
--    The sub must be either the legacy id or the linked supa_user_id of
--    the account that owns the fund_config rows.
