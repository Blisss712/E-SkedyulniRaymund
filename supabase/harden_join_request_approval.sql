-- ==============================================================================
-- E-SKEDYUL: join-request approval hardening (superseded)
-- ==============================================================================
-- This file used to replace approve_join_request() with an administrator-only
-- version and restrict EXECUTE to signed-in roles.
--
-- It is superseded by supabase/coordinator_join_approvals.sql, which:
--   * keeps the administrator check and adds the ministry's coordinator;
--   * moves decisions into review_join_request() and keeps approve_join_request()
--     as a compatibility wrapper;
--   * records reviewed_by for either role (the foreign key now targets auth.users);
--   * restricts EXECUTE on both RPCs to authenticated and service_role.
--
-- Run supabase/coordinator_join_approvals.sql instead. This file deliberately
-- makes no changes, because re-running the old administrator-only definition
-- after the new migration would remove coordinator approvals again.
--
-- The read-only checks below show the current state. Anon must not be able to
-- execute either function.
SELECT
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('review_join_request', 'approve_join_request')
ORDER BY p.proname;
