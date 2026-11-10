-- ==============================================================================
-- E-SKEDYUL: restrict join-request approval to administrators
-- ==============================================================================
-- Run once in Supabase Dashboard -> SQL Editor on a project that already has
-- supabase/schema.sql installed. Safe to run more than once. This is optional:
-- the app works without it, but it closes a privilege gap.
--
-- Why it matters
-- --------------
-- approve_join_request() is SECURITY DEFINER and, like every PostgreSQL
-- function, was created with EXECUTE granted to PUBLIC. That included the
-- `anon` role, so anyone holding the public anon key could approve a join
-- request if they knew its id.
--
-- The function now checks public.is_admin(auth.uid()) and is executable only by
-- the `authenticated` and `service_role` roles. The app calls it only while an
-- administrator is signed in; if the call is ever rejected it falls back to its
-- own RLS-checked status update plus membership insert, so approval still works
-- for a real administrator.
--
-- The FastAPI backend in ./backend is unaffected: it writes these rows through
-- SQLAlchemy and never calls this function.

CREATE OR REPLACE FUNCTION public.approve_join_request(
    req_id VARCHAR,
    reviewer_id UUID,
    note TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
BEGIN
    -- Approval is an administrator action. auth.uid() is the signed-in caller.
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only administrators can approve join requests';
    END IF;

    SELECT * INTO v_req FROM public.organization_join_requests WHERE id = req_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    UPDATE public.organization_join_requests
    SET status = 'approved',
        reviewed_at = NOW(),
        reviewed_by = reviewer_id,
        reviewer_note = note
    WHERE id = req_id;

    IF v_req.member_user_id IS NOT NULL THEN
        INSERT INTO public.organization_member_accounts (organization_id, user_id)
        VALUES (v_req.organization_id, v_req.member_user_id)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT)
    TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- Expected result: anon_can_execute = false, authenticated_can_execute = true.
-- ------------------------------------------------------------------------------
SELECT
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_join_request';
