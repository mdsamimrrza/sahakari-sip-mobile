-- ============================================================
-- SahakariSIP — FIX: expose the web profile photo to the mobile APK
-- (v2: checks every likely user table, case-insensitive email)
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Re-running is safe (CREATE OR REPLACE).
--
-- THE SITUATION
--   Logging in with Google on the WEB app stores your photo in a column
--   called `image` on your user row. The mobile APK signs in with
--   Supabase Auth, whose metadata has no picture for such accounts — so
--   the app falls back to the initial letter.
--
-- THE FIX
--   A tiny read-only RPC that returns the current user's web profile
--   (name + image) by email, looking in each table that could hold it:
--     1. next_auth.users (name, image)   <- NextAuth default schema
--     2. public.users (name, image)
--     3. public.profiles (name, image)
--     4. public.profiles (name, avatar_url)
--   Missing tables/columns are skipped automatically. The APK calls it
--   after sign-in; if this function doesn't exist yet the app simply
--   keeps the initial avatar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.app_get_profile()
RETURNS TABLE (name text, image text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, next_auth, auth
AS $$
DECLARE
  v_email text;
  v_name text;
  v_image text;
BEGIN
  SELECT au.email INTO v_email FROM auth.users au WHERE au.id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  -- 1. Web NextAuth users table (Google photo lives in `image`)
  BEGIN
    SELECT nu.name, nu.image INTO v_name, v_image
      FROM next_auth.users nu WHERE BTRIM(LOWER(nu.email)) = BTRIM(LOWER(v_email)) LIMIT 1;
    IF v_name IS NOT NULL OR v_image IS NOT NULL THEN
      name := v_name; image := v_image; RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_name := NULL; v_image := NULL;
  END;

  -- 2. public.users with an `image` column
  BEGIN
    SELECT u.name, u.image INTO v_name, v_image
      FROM public.users u WHERE BTRIM(LOWER(u.email)) = BTRIM(LOWER(v_email)) LIMIT 1;
    IF v_name IS NOT NULL OR v_image IS NOT NULL THEN
      name := v_name; image := v_image; RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_name := NULL; v_image := NULL;
  END;

  -- 3. public.profiles with an `image` column
  BEGIN
    SELECT p.name, p.image INTO v_name, v_image
      FROM public.profiles p WHERE BTRIM(LOWER(p.email)) = BTRIM(LOWER(v_email)) LIMIT 1;
    IF v_name IS NOT NULL OR v_image IS NOT NULL THEN
      name := v_name; image := v_image; RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_name := NULL; v_image := NULL;
  END;

  -- 4. public.profiles with an `avatar_url` column
  BEGIN
    SELECT p.name, p.avatar_url INTO v_name, v_image
      FROM public.profiles p WHERE BTRIM(LOWER(p.email)) = BTRIM(LOWER(v_email)) LIMIT 1;
    IF v_name IS NOT NULL OR v_image IS NOT NULL THEN
      name := v_name; image := v_image; RETURN NEXT; RETURN;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_name := NULL; v_image := NULL;
  END;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_get_profile() TO authenticated;

-- ---------- Verify (IMPORTANT - read this) ----------
-- NOTE: `SELECT * FROM public.app_get_profile();` in this editor will
-- ALWAYS return zero rows, because the editor runs as `postgres` with no
-- logged-in user (auth.uid() is empty here). That proves NOTHING - the
-- function only returns your row when the APP calls it with your login.
--
-- Instead, check the two emails match with these (editor sees all rows):
--   SELECT email, name, LEFT(image, 80) AS image_preview FROM next_auth.users;
--   SELECT email FROM auth.users;
-- The email shown on the app's Profile screen MUST equal the
-- next_auth.users row email. If they differ (e.g. web Google login vs a
-- different mobile login), no photo can match - sign into the app with
-- the SAME email you used for Google on the web.
