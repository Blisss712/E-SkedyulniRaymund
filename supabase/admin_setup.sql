-- ==============================================================================
-- E-SKEDYUL: Administrator Backend Setup & Troubleshooting Script
-- ==============================================================================
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- This script safely updates or installs:
-- 1. Extensions & admin_profiles table
-- 2. is_admin(uid) security helper
-- 3. get_admin_email(p_identifier) username-to-email resolver for sign-in
-- 4. make_admin(email, username) promotion helper (SQL editor / service role only)
-- 5. admin_settings + promote_current_user_to_admin() self-service activation
-- 6. Row-Level Security (RLS) policies for admin_profiles
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

-- 5. Self-service administrator activation
-- A signed-in member can promote their own email account with a setup code,
-- so nobody needs SQL editor or service-role access to activate an admin.
CREATE TABLE IF NOT EXISTS public.admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
-- No RLS policies on purpose: only the SECURITY DEFINER helper below and the
-- SQL editor / service role may read the setup code.
REVOKE ALL ON TABLE public.admin_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_settings TO service_role;

INSERT INTO public.admin_settings (key, value)
VALUES ('admin_promotion_code', 'ESK-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 12)))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promote_current_user_to_admin(
    p_code TEXT,
    p_username TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_meta_name TEXT;
    v_expected_code TEXT;
    v_base_username TEXT;
    v_username TEXT;
    v_counter INT := 1;
    v_profile public.admin_profiles;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Sign in with your E-Skedyul account before activating administrator access.';
    END IF;

    SELECT value INTO v_expected_code
    FROM public.admin_settings
    WHERE key = 'admin_promotion_code';

    IF v_expected_code IS NULL THEN
        RAISE EXCEPTION 'Administrator activation is not configured. Run supabase/admin_setup.sql in the Supabase SQL editor.';
    END IF;

    IF p_code IS NULL OR btrim(p_code) = '' OR btrim(p_code) <> v_expected_code THEN
        RAISE EXCEPTION 'The administrator setup code is not valid.';
    END IF;

    SELECT lower(email),
           COALESCE(
               nullif(btrim(raw_user_meta_data->>'full_name'), ''),
               nullif(btrim(raw_user_meta_data->>'name'), '')
           )
    INTO v_email, v_meta_name
    FROM auth.users
    WHERE id = v_uid;

    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'This account has no email address, so it cannot be promoted to administrator.';
    END IF;

    v_base_username := COALESCE(nullif(btrim(p_username), ''), split_part(v_email, '@', 1));

    IF v_base_username !~ '^[A-Za-z0-9._-]{3,80}$' THEN
        RAISE EXCEPTION 'Choose an admin username of 3-80 characters using letters, numbers, dots, dashes, or underscores.';
    END IF;

    -- Keep usernames unique without failing the promotion
    v_username := v_base_username;
    WHILE EXISTS (
        SELECT 1 FROM public.admin_profiles
        WHERE lower(username) = lower(v_username)
          AND user_id <> v_uid
    ) LOOP
        v_counter := v_counter + 1;
        v_username := v_base_username || v_counter::text;
    END LOOP;

    INSERT INTO public.admin_profiles (user_id, username, email, full_name, role, active)
    VALUES (
        v_uid,
        v_username,
        v_email,
        COALESCE(v_meta_name, 'Administrator'),
        'admin',
        TRUE
    )
    ON CONFLICT (user_id) DO UPDATE
    SET role = 'admin',
        active = TRUE,
        email = EXCLUDED.email,
        username = EXCLUDED.username,
        full_name = CASE
            WHEN btrim(public.admin_profiles.full_name) = '' THEN EXCLUDED.full_name
            ELSE public.admin_profiles.full_name
        END
    RETURNING * INTO v_profile;

    RETURN to_jsonb(v_profile);
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Another administrator profile already uses this email address or username.';
END;
$$;

REVOKE ALL ON FUNCTION public.promote_current_user_to_admin(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_current_user_to_admin(TEXT, TEXT) TO authenticated;

-- 6. Row-Level Security Policies for admin_profiles

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
-- STEP 1 - Read the in-app activation code (the app asks for it on the
-- "Activate administrator access" form):
-- SELECT value AS admin_promotion_code
-- FROM public.admin_settings
-- WHERE key = 'admin_promotion_code';
--
-- STEP 2 - Optional: choose your own code instead of the generated one.
-- UPDATE public.admin_settings
-- SET value = 'MY-ADMIN-CODE', updated_at = NOW()
-- WHERE key = 'admin_promotion_code';
--
-- STEP 3 - Alternative: promote an existing Auth user from the SQL editor
-- (this bypasses the setup code and is only for trusted operators):
-- SELECT public.make_admin('your-registered-email@example.com', 'admin');
--
-- Then sign in at the app's admin screen with that email or admin username.
-- ==============================================================================
