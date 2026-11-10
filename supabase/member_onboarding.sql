-- ------------------------------------------------------------------------------
-- E-Skedyul: member onboarding flag
-- ------------------------------------------------------------------------------
-- Run this once on a project that already has supabase/schema.sql installed.
-- Fresh installs get the column straight from schema.sql and do not need it.
--
-- Why it exists:
--   Email and phone sign-ups reach the setup wizard because their profile has no
--   real name yet. Google and Facebook return a full name and an email address,
--   so nothing distinguished a brand-new social account from a returning member,
--   and the wizard ("Tell us your name" -> "Join a Ministry Group") was skipped.
--   The client now opens the wizard while `onboarded` is FALSE and sets it to
--   TRUE when the member confirms their name.
--
-- The script is idempotent: running it again changes nothing.
-- ------------------------------------------------------------------------------

BEGIN;

-- 1. The column.
ALTER TABLE public.member_profiles
    ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.member_profiles.onboarded IS
    'FALSE until the member finishes the in-app account setup wizard (name + group code).';

-- 2. Backfill (opt-in, off by default).
--    The client treats "nothing recorded" as "setup not finished", so a member who
--    has never confirmed their name is asked once — including one who signed in
--    with Google/Facebook before this flag existed. Marking old rows as finished
--    would hide the wizard for accounts that never went through it, which is the
--    exact bug this flag fixes. Uncomment the UPDATE only if you would rather keep
--    long-standing members out of the wizard and accept that older social accounts
--    skip setup as well.
--
-- UPDATE public.member_profiles
-- SET onboarded = TRUE
-- WHERE onboarded = FALSE;

-- 3. The member writes their own name and flag when they finish the wizard.
--    Re-created here so the script also fixes a project whose policy is missing.
DROP POLICY IF EXISTS "Update own member profile" ON public.member_profiles;
CREATE POLICY "Update own member profile" ON public.member_profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

COMMIT;

-- 4. Verification (read-only). Every account that has not finished the wizard
--    should still be pending, including accounts that already signed in with
--    Google or Facebook.
SELECT
    (SELECT COUNT(*) FROM public.member_profiles) AS member_profiles,
    (SELECT COUNT(*) FROM public.member_profiles WHERE onboarded) AS onboarded_profiles,
    (SELECT COUNT(*) FROM public.member_profiles WHERE NOT onboarded) AS pending_onboarding;

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'member_profiles'
ORDER BY policyname;
