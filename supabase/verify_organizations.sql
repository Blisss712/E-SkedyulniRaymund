-- ==============================================================================
-- E-SKEDYUL: organizations / memberships / join requests verification
-- ==============================================================================
-- Read-only. Paste this into Supabase Dashboard -> SQL Editor and click Run.
--
-- The administrator's Organizations page and Dashboard metrics, the member
-- dashboard's "My Ministries" list, and the join-code lookup all read the same
-- three tables, so these checks cover every screen that reports an
-- organization. Nothing here changes data.

-- ------------------------------------------------------------------------------
-- 1) The tables that must exist.
-- ------------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'organization_member_accounts',
    'organization_leaders',
    'organization_join_requests'
  )
ORDER BY table_name;
-- Expect four rows. If organization_leaders is missing, run
-- supabase/organization_leaders.sql (or the latest schema.sql) to enable
-- ministry coordinators.

-- ------------------------------------------------------------------------------
-- 2) Columns. Check `column_default` on the two NOT NULL columns the app does
--    not supply itself:
--      organizations.join_code        -> 'ESK-' || ...
--      organization_join_requests.id  -> 'req-' || ...
--    If either default is NULL the matching create/submit fails with a
--    "null value in column ... violates not-null constraint" error.
-- ------------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'organization_member_accounts',
    'organization_leaders',
    'organization_join_requests'
  )
ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- 3) Row level security must be enabled.
-- ------------------------------------------------------------------------------
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'organizations',
    'organization_member_accounts',
    'organization_leaders',
    'organization_join_requests'
  )
ORDER BY relname;
-- Expect rls_enabled = true for all four.

-- ------------------------------------------------------------------------------
-- 4) The policies each screen depends on.
-- ------------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations',
    'organization_member_accounts',
    'organization_leaders',
    'organization_join_requests'
  )
ORDER BY tablename, cmd, policyname;
-- Expect:
--   organizations
--     "Public read active organizations"   (SELECT, anon + authenticated)
--     "Admins full manage organizations"   (ALL, authenticated)
--     "Coordinators read their ministries" (SELECT, authenticated)
--   organization_member_accounts
--     "Members read own memberships"       (SELECT)
--     "Admins full manage memberships"     (ALL)
--   organization_leaders
--     "Coordinators read own appointments" (SELECT)
--     "Admins manage coordinator appointments" (ALL)
--   organization_join_requests
--     "Members insert own join requests"   (INSERT)
--     "Members read own join requests"     (SELECT)
--     "Admins full manage join requests"   (ALL)

-- ------------------------------------------------------------------------------
-- 5) Helper functions and who may execute them.
--    `anon_can_execute` must be false for approve_join_request; if it is true,
--    run supabase/harden_join_request_approval.sql once.
-- ------------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'approve_join_request', 'is_organization_leader')
ORDER BY p.proname;

-- ------------------------------------------------------------------------------
-- 6) The organizations that exist right now, with the join code members type.
--    This is exactly what the admin workspace lists and what a member sees
--    appear on their dashboard after approval.
-- ------------------------------------------------------------------------------
SELECT id, name, category, status, join_code
FROM public.organizations
ORDER BY name;

-- ------------------------------------------------------------------------------
-- 7) The coordinators appointed right now. Each row is one ministry/account
--    pair; an empty result means no coordinator has been appointed yet.
-- ------------------------------------------------------------------------------
SELECT o.name AS ministry, m.full_name AS coordinator, m.email, l.appointed_at
FROM public.organization_leaders l
JOIN public.organizations o ON o.id = l.organization_id
JOIN public.member_profiles m ON m.user_id = l.user_id
ORDER BY o.name, m.full_name;
