-- ============================================================
-- SahakariSIP — HARDENING: RLS enablement, notification policies,
--                 confirmed-email identity mapping
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor →
-- New query), AFTER supabase-fix-user-mapping.sql.
--
-- WHY (security audit sipapk-run-1)
--   1. No script in version control ever ran ALTER TABLE ... ENABLE ROW
--      LEVEL SECURITY. Policies without RLS enabled are no-ops, and the
--      mobile client (public anon key) relies entirely on RLS.
--   2. notifications_log / notification_preferences had NO policy text in
--      version control — only a comment referencing an undefined
--      next_auth.uid() function.
--   3. app_effective_user_id() mapped accounts BY EMAIL with no proof of
--      email ownership, so (if email confirmation is disabled) any Supabase
--      Auth signup with a victim's email inherited their data identity.
--
-- ORDER OF OPERATIONS
--   a) In Dashboard → Authentication → Sign In / Providers, turn ON
--      "Confirm email" FIRST, and make sure existing users have confirmed
--      emails (unconfirmed mobile accounts fall back to their own auth uid
--      after this script, which changes which rows they can see).
--   b) Then run this script. It is idempotent — safe to re-run.
-- ============================================================

-- ---------- 1. Enable Row Level Security on every tenant table ----------
-- Idempotent: enabling twice is harmless.

ALTER TABLE public.fund_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nav_history               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_log         ENABLE ROW LEVEL SECURITY;

-- ---------- 2. Policies for the notification tables ----------
-- Same effective-id convention as the data tables
-- (supabase-fix-user-mapping.sql). The effective id is the web NextAuth id
-- when the caller's confirmed email matches, else the caller's auth uid —
-- so rows written under either id space remain visible to their owner.

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

-- ---------- 3. Identity mapping requires a CONFIRMED email ----------
-- Only map by email when the caller's Supabase Auth email is verified.
-- An unconfirmed signup with someone else's email now falls back to its
-- own auth.uid() and can never inherit that email's data identity.
-- Replaces the version in supabase-fix-user-mapping.sql.

CREATE OR REPLACE FUNCTION public.app_effective_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
  WITH caller AS (
    SELECT
      au.email,
      au.email_confirmed_at IS NOT NULL AS email_confirmed
    FROM auth.users au
    WHERE au.id = auth.uid()
  )
  SELECT COALESCE(
    (SELECT nu.id
       FROM next_auth.users nu, caller c
      WHERE c.email_confirmed
        AND nu.email = c.email
      LIMIT 1),
    auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.app_effective_user_id() TO authenticated;

-- ---------- 4. Same confirmed-email rule for app_ensure_user_row ----------
-- A mobile-only account still gets its own next_auth.users row, but the
-- returned id must agree with the hardened mapping above.

CREATE OR REPLACE FUNCTION public.app_ensure_user_row()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
DECLARE
  v_email text;
  v_confirmed boolean;
BEGIN
  SELECT au.email, au.email_confirmed_at IS NOT NULL
    INTO v_email, v_confirmed
  FROM auth.users au
  WHERE au.id = auth.uid();
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Seed the caller's own row only; never adopt a foreign row here.
  INSERT INTO next_auth.users (id, email)
  VALUES (auth.uid(), v_email)
  ON CONFLICT DO NOTHING;

  IF v_confirmed THEN
    RETURN COALESCE(
      (SELECT nu.id FROM next_auth.users nu WHERE nu.email = v_email LIMIT 1),
      auth.uid()
    );
  END IF;
  RETURN auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_ensure_user_row() TO authenticated;

-- ---------- Verify (optional, read-only) ----------
-- As the project owner:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';
--   → every tenant table must show true.
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('notification_preferences','notifications_log');
--   → one "users manage own ..." policy per table.
-- While signed in as a CONFIRMED Supabase Auth user:
--   SELECT public.app_effective_user_id();
--   → the next_auth.users id owning your data, or your auth uid.
