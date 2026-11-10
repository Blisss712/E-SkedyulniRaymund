-- ==============================================================================
-- E-SKEDYUL: Administrator Backend Setup & Troubleshooting Script
-- ==============================================================================
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- This script safely updates or installs:
-- 1. Extensions & admin_profiles table
-- 2. is_admin(uid) security helper
-- 3. get_admin_email(p_identifier) username-to-email resolver for sign-in
-- 4. make_admin(email, username) promotion helper (SQL editor / service role only)
-- 5. Row-Level Security (RLS) policies for admin_profiles
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Direct inserts into auth.users are not supported. Remove the legacy helper
-- if it was installed by an earlier version of this script.
DROP FUNCTION IF EXISTS public.create_admin_account(TEXT, TEXT, TEXT, TEXT);

-- 1. Ensure admin_profiles table exists
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    role VARCHAR(30) NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_profiles_username_ci 
    ON public.admin_profiles (lower(username));

-- 2. is_admin check helper
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_profiles
        WHERE user_id = uid AND role = 'admin' AND active = TRUE
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO anon, authenticated;

-- 3. Username / Email resolver for admin sign-in
CREATE OR REPLACE FUNCTION public.get_admin_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    found_email TEXT;
    clean_id TEXT;
BEGIN
    IF p_identifier IS NULL THEN
        RETURN NULL;
    END IF;

    clean_id := trim(p_identifier);
    IF length(clean_id) = 0 THEN
        RETURN NULL;
    END IF;

    -- If identifier already contains '@', return lowercased
    IF clean_id LIKE '%@%' THEN
        RETURN lower(clean_id);
    END IF;

    -- Look up email by username in admin_profiles
    SELECT email INTO found_email
    FROM public.admin_profiles
    WHERE lower(username) = lower(clean_id)
      AND active = TRUE
    LIMIT 1;

    RETURN found_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_email(TEXT) TO anon, authenticated;

-- 4. Promote existing user to administrator
CREATE OR REPLACE FUNCTION public.make_admin(target_email TEXT, target_username TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_full_name TEXT;
    v_base_username TEXT;
    v_username TEXT;
    v_counter INT := 1;
BEGIN
    SELECT id, raw_user_meta_data->>'full_name' INTO v_user_id, v_full_name
    FROM auth.users
    WHERE lower(email) = lower(trim(target_email));

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % does not exist in auth.users yet. Create the user through Supabase Auth first.', target_email;
    END IF;

    -- Ensure email is confirmed so Supabase does not block login
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = v_user_id;

    -- Prevent username collisions
    v_base_username := COALESCE(nullif(trim(target_username), ''), split_part(target_email, '@', 1));
    v_username := v_base_username;
    WHILE EXISTS (SELECT 1 FROM public.admin_profiles WHERE lower(username) = lower(v_username) AND user_id <> v_user_id) LOOP
        v_counter := v_counter + 1;
        v_username := v_base_username || v_counter::text;
    END LOOP;

    INSERT INTO public.admin_profiles (user_id, username, email, full_name, role, active)
    VALUES (
        v_user_id,
        v_username,
        lower(trim(target_email)),
        COALESCE(nullif(trim(v_full_name), ''), 'Administrator'),
        'admin',
        TRUE
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'admin',
        active = TRUE,
        email = EXCLUDED.email,
        username = EXCLUDED.username;
END;
$$;

-- make_admin() writes administrator rows directly and therefore bypasses RLS.
-- It must never be callable with the public anon key, so only the SQL editor
-- (postgres), the service role, and the FastAPI backend keep access.
DO $$
BEGIN
    IF to_regprocedure('public.make_admin(text,text)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.make_admin(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.make_admin(TEXT, TEXT) TO service_role;
    END IF;
END;
$$;

-- 5. Row-Level Security Policies for admin_profiles

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read own admin profile or any if admin" ON public.admin_profiles;
CREATE POLICY "Read own admin profile or any if admin" ON public.admin_profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update admin profiles" ON public.admin_profiles;
CREATE POLICY "Admins update admin profiles" ON public.admin_profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ==============================================================================
-- QUICK RUN COMMANDS
-- ==============================================================================
--
-- Administrators are promoted only from the Supabase SQL editor (or the service
-- role). The app has no promotion UI, so the public anon key cannot grant admin.
--
-- STEP 1 - Promote an existing Auth user (the account must already be registered
-- through the app or Supabase Dashboard -> Authentication -> Users):
-- SELECT public.make_admin('your-registered-email@example.com', 'admin');
--
-- STEP 2 - Verify the administrator profile:
-- SELECT u.email, a.username, a.role, a.active
-- FROM auth.users u
-- LEFT JOIN public.admin_profiles a ON a.user_id = u.id
-- WHERE lower(u.email) = lower('your-registered-email@example.com');
--
-- Then sign in at the app's admin screen with that email or admin username.
-- A fully self-contained copy-paste query (no dependency on make_admin) lives in
-- supabase/promote_to_admin.sql.
-- ==============================================================================
