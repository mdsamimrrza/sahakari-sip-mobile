-- ============================================================
-- SahakariSIP — VERIFY: RLS, policies, and identity mapping
-- ============================================================
-- READ-ONLY. Run in the Supabase SQL Editor (Dashboard → SQL Editor →
-- New query) after supabase-enable-rls.sql. Nothing here writes.
--
-- WHY (security audit sipapk-run-2, NEEDS-VAL-002)
--   The mobile APK ships the *anon* key and relies entirely on Postgres
--   Row Level Security for per-user isolation. Whether RLS is actually
--   enabled, and whether every tenant table has a policy, is deployed
--   configuration that lives outside the repository. These queries turn
--   the "trust me" into a check the owner can run in one paste.
--
-- HOW TO READ THE OUTPUT
--   Query 1 — every row must show rls_enabled = true. A `false` or a
--             missing table means that table is readable by ANY caller
--             holding the anon key. Stop and fix before shipping.
--   Query 2 — every tenant table must have at least one policy. RLS
--             enabled with zero policies denies everything (the app
--             would look empty), which is safe but broken; a policy on
--             the wrong column is neither.
--   Query 3 — inspects the actual USING expression so you can confirm it
--             compares user_id to the effective user id, not something
--             like `true`.
--   Query 4 — cross-user read probe. Run it (a) as the owner, and (b)
--             while signed in as a second test user, and compare.
-- ============================================================

-- ---------- 1. Is RLS enabled on every tenant table? ----------
-- Expect rls_enabled = true for all five rows.

SELECT
  c.relname                                  AS table_name,
  c.relrowsecurity                           AS rls_enabled,
  c.relforcerowsecurity                      AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'fund_config',
    'entries',
    'nav_history',
    'notification_preferences',
    'notifications_log'
  )
ORDER BY c.relname;

-- ---------- 2. Policy inventory per tenant table ----------
-- Expect >= 1 row per table. `permissive` + `ALL` means one policy
-- covers SELECT/INSERT/UPDATE/DELETE (the app's convention).

SELECT
  tablename,
  policyname,
  cmd       AS applies_to,
  permissive,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'fund_config',
    'entries',
    'nav_history',
    'notification_preferences',
    'notifications_log'
  )
ORDER BY tablename, policyname;

-- ---------- 3. What the policies actually say ----------
-- Read the USING / WITH CHECK expressions. The user_id side must be
-- compared to app_effective_user_id() (or auth.uid()); a literal `true`
-- or a missing WITH CHECK on a write policy is a finding.

SELECT
  tablename,
  policyname,
  cmd,
  qual        AS using_expression,
  with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'fund_config',
    'entries',
    'nav_history',
    'notification_preferences',
    'notifications_log'
  )
ORDER BY tablename, policyname;

-- ---------- 4. Cross-user read probe ----------
-- While signed in as user A, this returns ONLY user A's rows. If you
-- see rows belonging to another account, RLS is not isolating.
-- In the SQL Editor (runs as postgres, no JWT) it returns everything —
-- that is expected and proves nothing. Use it from the app's session
-- or a Supabase client authenticated as a test user.

SELECT
  'fund_config' AS table_name,
  user_id,
  COUNT(*) AS visible_rows
FROM public.fund_config
GROUP BY user_id
UNION ALL
SELECT 'entries', user_id, COUNT(*) FROM public.entries GROUP BY user_id
UNION ALL
SELECT 'nav_history', user_id, COUNT(*) FROM public.nav_history GROUP BY user_id
ORDER BY table_name, user_id;

-- ---------- 5. Confirm the identity mapping is the hardened one ----------
-- Expect the definition to reference `email_confirmed_at IS NOT NULL`.
-- If it maps purely by email, a signup using a victim's email address
-- could inherit that victim's data identity.

SELECT
  p.proname              AS function_name,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('app_effective_user_id', 'app_ensure_user_row');

-- ---------- 6. Emails used for identity mapping must be unique ----------
-- app_effective_user_id() resolves by email with LIMIT 1. If two
-- next_auth.users rows share an email, which one wins is arbitrary.
-- Expect zero rows below (case-insensitive duplicates).

SELECT
  BTRIM(LOWER(email)) AS email,
  COUNT(*)            AS row_count
FROM next_auth.users
GROUP BY BTRIM(LOWER(email))
HAVING COUNT(*) > 1;

-- ---------- 7. RLS as the anon role (the APK's key) ----------
-- The APK connects with the anon key and a user JWT. As the bare anon
-- role there is no auth.uid(), so these counts must be ZERO or the
-- query must error. Any non-zero count means the anon key alone can
-- read tenant data.

SET LOCAL ROLE anon;
SELECT 'fund_config' AS table_name, COUNT(*) AS rows_visible_to_anon
  FROM public.fund_config
UNION ALL
SELECT 'entries', COUNT(*) FROM public.entries
UNION ALL
SELECT 'nav_history', COUNT(*) FROM public.nav_history
UNION ALL
SELECT 'notification_preferences', COUNT(*) FROM public.notification_preferences
UNION ALL
SELECT 'notifications_log', COUNT(*) FROM public.notifications_log;
RESET ROLE;
