-- ============================================================
-- SahakariSIP — FIX: unify web (NextAuth) and mobile (Supabase Auth)
--                 user IDs so the APK sees the web app's data
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
--
-- THE PROBLEM
--   The web app's NextAuth stores users in next_auth.users and writes
--   fund_config/entries/nav_history with user_id = next_auth.users.id.
--   The mobile APK signs in with Supabase Auth (auth.users), whose ids are
--   DIFFERENT — so RLS ("user_id matches") returns 0 rows and the app
--   drops every existing user into onboarding ("Choose Fund").
--
-- THE FIX (keeps the web app working, no data migration, no secrets shipped)
--   1. app_effective_user_id(): maps the current Supabase Auth user to the
--      web's next_auth.users id BY EMAIL, falling back to the auth.users id.
--   2. RLS on fund_config / entries / nav_history now allows rows whose
--      user_id equals the effective id — for BOTH the web (NextAuth JWT
--      sub) and the APK (Supabase Auth uid).
-- ============================================================

-- ---------- 1. Effective user id (NextAuth id by email, else auth uid) ----------

CREATE OR REPLACE FUNCTION public.app_effective_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
  SELECT COALESCE(
    (SELECT nu.id
       FROM next_auth.users nu
      WHERE nu.email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
      LIMIT 1),
    auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_effective_user_id() TO authenticated;

-- ---------- 1b. Ensure a next_auth.users row exists for the account ----------
--
-- fund_config.user_id has a FOREIGN KEY to next_auth.users(id). A mobile-only
-- account (created via Supabase Auth) has no next_auth.users row, so inserting
-- funds would violate the FK. This function creates the row (id = auth.uid)
-- and is idempotent: if the email already belongs to a web account, the
-- existing row wins and the insert is a no-op. The app calls this ONCE after
-- sign-in, before any data write.

CREATE OR REPLACE FUNCTION public.app_ensure_user_row()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = auth.uid();
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO next_auth.users (id, email)
  VALUES (auth.uid(), v_email)
  ON CONFLICT DO NOTHING;

  RETURN COALESCE(
    (SELECT nu.id FROM next_auth.users nu WHERE nu.email = v_email LIMIT 1),
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_ensure_user_row() TO authenticated;

-- ---------- 2. RLS policies accept the effective id ----------

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

-- ---------- 3. Notifications log already accepts both id spaces ----------
-- (its policy is "next_auth.uid() = user_id OR auth.uid() = user_id" — no change)

-- ---------- Verify (optional) ----------
-- While signed in as your Supabase Auth user, run:
--   SELECT public.app_effective_user_id();
-- It should return the next_auth.users id that owns your fund data
-- (or your auth.users id if that email has no NextAuth account).
