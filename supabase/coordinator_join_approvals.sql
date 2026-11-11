-- ==============================================================================
-- E-SKEDYUL: coordinators review join requests for their ministries
-- ==============================================================================
-- Run once in Supabase Dashboard -> SQL Editor -> New query on a project that
-- already installed supabase/schema.sql (and, on an older project,
-- supabase/organization_leaders.sql). The script is idempotent: running it again
-- is safe.
--
-- Why this script exists
-- ----------------------
-- Before it:
--   * only administrators could read join requests (RLS), so a coordinator's
--     workspace had no request list to review;
--   * approve_join_request() rejected every non-administrator;
--   * organization_join_requests.reviewed_by referenced admin_profiles, so a
--     coordinator's member id could not be recorded as the reviewer.
--
-- After it:
--   * a coordinator can read the join requests of the ministries they lead;
--   * review_join_request() lets an administrator, or the coordinator of that
--     specific ministry, approve or reject a request; approval records the
--     decision and creates the membership row in one transaction;
--   * approve_join_request() remains as a compatibility wrapper for older app
--     builds and still works for both roles;
--   * reviewed_by references auth.users, so both administrators and
--     coordinators are valid reviewers.
--
-- Decisions are written only through review_join_request(); coordinators are
-- deliberately not given a direct UPDATE policy, so they cannot rewrite the
-- applicant, the organization, or any other column. The FastAPI backend in
-- ./backend is unaffected (it writes through SQLAlchemy, not this function).

-- ------------------------------------------------------------------------------
-- 1) The coordinator helper must exist first.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'is_organization_leader'
    ) THEN
        RAISE EXCEPTION
            'Run supabase/organization_leaders.sql (or the latest schema.sql) before this script.';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2) reviewed_by may be an administrator or a coordinator: both are auth users.
--    Drop whatever foreign key currently points at admin_profiles, then add the
--    auth.users reference. Existing admin ids remain valid.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    existing record;
BEGIN
    FOR existing IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.organization_join_requests'::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%(reviewed_by)%'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.organization_join_requests DROP CONSTRAINT %I',
            existing.conname
        );
    END LOOP;
END;
$$;

-- An orphaned reviewer (possible if the old foreign key was never installed)
-- would make the new constraint fail. Clear only those, never valid ids.
UPDATE public.organization_join_requests AS request
SET reviewed_by = NULL
WHERE request.reviewed_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM auth.users AS reviewer WHERE reviewer.id = request.reviewed_by
  );

ALTER TABLE public.organization_join_requests
    ADD CONSTRAINT organization_join_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------------------
-- 3) The decision function used by the workspace.
--    - auth.uid() is the reviewer; the supplied reviewer_id is only used when
--      there is no JWT (service_role / SQL editor) and must otherwise match.
--    - authorization is checked against the request's own organization, so a
--      coordinator of ministry A cannot decide ministry B's requests.
--    - approving inserts the membership row, which is what makes the ministry
--      appear on the member's dashboard.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_join_request(
    req_id VARCHAR,
    decision VARCHAR,
    reviewer_id UUID DEFAULT NULL,
    note TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
    v_reviewer UUID;
BEGIN
    IF decision IS NULL OR decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'The decision must be approved or rejected';
    END IF;

    v_reviewer := auth.uid();
    IF v_reviewer IS NULL THEN
        -- service_role and SQL-editor calls have no JWT; use the supplied id.
        v_reviewer := reviewer_id;
    ELSIF reviewer_id IS NOT NULL AND reviewer_id <> v_reviewer THEN
        RAISE EXCEPTION 'reviewer_id must match the signed-in user';
    END IF;

    IF v_reviewer IS NULL THEN
        RAISE EXCEPTION 'Sign in before reviewing a join request';
    END IF;

    SELECT * INTO v_req
    FROM public.organization_join_requests
    WHERE id = req_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;

    IF NOT (
        public.is_admin(v_reviewer)
        OR public.is_organization_leader(v_req.organization_id, v_reviewer)
    ) THEN
        RAISE EXCEPTION
            'Only an administrator or a coordinator of this ministry can review join requests';
    END IF;

    IF v_req.status <> 'pending' AND v_req.status <> decision THEN
        RAISE EXCEPTION 'This join request has already been reviewed';
    END IF;

    IF decision = 'approved' THEN
        IF v_req.member_user_id IS NULL THEN
            RAISE EXCEPTION 'This request is not linked to a member account';
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM public.member_profiles
            WHERE user_id = v_req.member_user_id
              AND active = TRUE
        ) THEN
            RAISE EXCEPTION 'This member account is no longer active';
        END IF;
    END IF;

    UPDATE public.organization_join_requests
    SET status = decision,
        reviewed_at = NOW(),
        reviewed_by = v_reviewer,
        reviewer_note = COALESCE(note, '')
    WHERE id = req_id;

    IF decision = 'approved' THEN
        INSERT INTO public.organization_member_accounts (organization_id, user_id, joined_at)
        VALUES (v_req.organization_id, v_req.member_user_id, NOW())
        ON CONFLICT (organization_id, user_id) DO NOTHING;
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4) Compatibility wrapper: older app builds call approve_join_request().
--    The same authorization and membership rules apply.
-- ------------------------------------------------------------------------------
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
BEGIN
    PERFORM public.review_join_request(req_id, 'approved', reviewer_id, note);
END;
$$;

-- ------------------------------------------------------------------------------
-- 5) Only signed-in callers may execute the decision functions.
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.review_join_request(VARCHAR, VARCHAR, UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_join_request(VARCHAR, VARCHAR, UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT)
    TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6) RLS: a coordinator can read the requests of the ministries they lead.
--    Administrators keep their existing "full manage" policy; members keep
--    reading their own requests. Policies are additive (OR).
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coordinators read ministry join requests"
    ON public.organization_join_requests;
CREATE POLICY "Coordinators read ministry join requests"
ON public.organization_join_requests
FOR SELECT TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()));

-- No direct UPDATE/INSERT/DELETE policy for coordinators on purpose. Manual
-- table writes stay administrator-only; coordinator decisions go through
-- review_join_request(), which validates the ministry and writes only the
-- decision columns plus the membership row.

-- Ask PostgREST to reload its schema cache so the new RPC is callable at once.
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------------------------
-- 7) Verify. Expect:
--    * reviewed_by -> auth.users;
--    * anon_can_execute = false for both functions;
--    * a "Coordinators read ministry join requests" SELECT policy.
-- ------------------------------------------------------------------------------
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.organization_join_requests'::regclass
  AND contype = 'f'
  AND pg_get_constraintdef(oid) LIKE '%(reviewed_by)%';

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

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'organization_join_requests'
ORDER BY cmd, policyname;
