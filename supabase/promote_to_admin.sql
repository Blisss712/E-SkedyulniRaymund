-- ==============================================================================
-- E-SKEDYUL: PROMOTE A USER TO ADMINISTRATOR (SQL EDITOR ONLY)
-- ==============================================================================
-- Run this in Supabase Dashboard -> SQL Editor -> New Query.
--
-- The app has no promotion UI: administrator access can only be granted here, so
-- the public anon key can never escalate an account.
--
-- HOW TO USE
--   1. Register the person through the app ("Create Account") or Dashboard ->
--      Authentication -> Users, so the user exists in auth.users.
--   2. Add one (email, username) row per person in PART 1.
--   3. Select the whole file and Run. PART 0 is a safe one-time cleanup, PART 2
--      lists every administrator so you can confirm the result.
-- ==============================================================================


-- ==============================================================================
-- PART 0 - ONE-TIME CLEANUP: disable the old browser-callable promotion RPC
-- ==============================================================================
-- Earlier builds let a signed-in member promote themselves with a setup code.
-- Dropping the function and its settings table removes that path permanently.
-- Idempotent: safe to run more than once.

DROP FUNCTION IF EXISTS public.promote_current_user_to_admin(TEXT, TEXT) CASCADE;
DROP TABLE IF EXISTS public.admin_settings CASCADE;

-- Confirm the old browser-callable path is gone (both columns must be NULL):
SELECT to_regprocedure('public.promote_current_user_to_admin(text,text)') AS old_promotion_function,
       to_regclass('public.admin_settings') AS old_settings_table;


-- ==============================================================================
-- PART 1 - PROMOTE ONE OR MORE USERS
-- ==============================================================================
-- Add one row per administrator below, then run. Every account must already be
-- registered (app Create Account, or Dashboard -> Authentication -> Users).
-- Works even on projects where the make_admin() helper was never installed.
--
-- The run is all-or-nothing: if any email is unregistered or a username is
-- invalid, the whole statement rolls back and nothing is promoted. Split the
-- list into separate runs if you want partial success.

DO $$
DECLARE
    v_target    RECORD;
    v_user_id   UUID;
    v_full_name TEXT;
    v_base      TEXT;
    v_username  TEXT;
    v_counter   INT;
    v_promoted  INT := 0;
BEGIN
    FOR v_target IN
        SELECT *
          FROM (VALUES
              ('person@example.com', 'person'),
              ('second@example.com', 'second')
              -- add more rows here: ('email@example.com', 'username')
          ) AS t(email, username)
    LOOP
        IF v_target.email IS NULL OR btrim(v_target.email) = '' THEN
            RAISE EXCEPTION 'Every entry needs an email address.';
        END IF;

        SELECT u.id,
               COALESCE(NULLIF(btrim(u.raw_user_meta_data->>'full_name'), ''), 'Administrator')
          INTO v_user_id, v_full_name
          FROM auth.users u
         WHERE lower(u.email) = lower(btrim(v_target.email));

        IF v_user_id IS NULL THEN
            RAISE EXCEPTION
                'No Supabase Auth user exists with email %. Create the account first (app Create Account, or Dashboard -> Authentication -> Users).',
                v_target.email;
        END IF;

        -- Make sure Supabase does not block the sign-in on an unconfirmed email.
        UPDATE auth.users
           SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
         WHERE id = v_user_id;

        v_base := COALESCE(
            NULLIF(btrim(v_target.username), ''),
            split_part(lower(btrim(v_target.email)), '@', 1)
        );

        IF v_base !~ '^[A-Za-z0-9._-]{3,80}$' THEN
            RAISE EXCEPTION
                'Username "%" for % must be 3-80 characters using letters, numbers, dots, dashes, or underscores.',
                v_base, v_target.email;
        END IF;

        -- Keep the username unique instead of failing the promotion.
        v_username := v_base;
        v_counter := 1;
        WHILE EXISTS (
            SELECT 1
              FROM public.admin_profiles p
             WHERE lower(p.username) = lower(v_username)
               AND p.user_id <> v_user_id
        ) LOOP
            v_counter := v_counter + 1;
            v_username := v_base || v_counter::text;
        END LOOP;

        INSERT INTO public.admin_profiles (user_id, username, email, full_name, role, active)
        VALUES (
            v_user_id,
            v_username,
            lower(btrim(v_target.email)),
            v_full_name,
            'admin',
            TRUE
        )
        ON CONFLICT (user_id) DO UPDATE
           SET role     = 'admin',
               active   = TRUE,
               email    = EXCLUDED.email,
               username = EXCLUDED.username;

        v_promoted := v_promoted + 1;
        RAISE NOTICE 'Promoted % to administrator (admin username: %).', v_target.email, v_username;
    END LOOP;

    RAISE NOTICE 'Done: % account(s) processed; each now has administrator access.', v_promoted;
END
$$;


-- ==============================================================================
-- PART 2 - VERIFY (lists every administrator; no editing needed)
-- ==============================================================================

SELECT u.email,
       a.username,
       a.role,
       a.active,
       a.created_at
  FROM public.admin_profiles a
  JOIN auth.users u ON u.id = a.user_id
 ORDER BY a.created_at DESC;


-- ==============================================================================
-- PART 3 - DEMOTE / REMOVE ADMINISTRATOR ACCESS
-- ==============================================================================
-- Uncomment, set the email, and run. The account stays valid as a normal member;
-- it just loses the admin workspace.

-- DELETE FROM public.admin_profiles
-- WHERE lower(email) = lower('person@example.com');


-- ==============================================================================
-- ALTERNATIVE - one-line promotion when make_admin() is installed
-- ==============================================================================
-- SELECT public.make_admin('person@example.com', 'person');
-- SELECT public.make_admin('person@example.com', NULL);  -- username from email
