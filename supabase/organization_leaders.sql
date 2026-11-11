-- ==============================================================================
-- E-SKEDYUL: Ministry coordinators (leaders)
-- ==============================================================================
-- Run this once in Supabase Dashboard -> SQL Editor -> New query on a project
-- that already installed supabase/schema.sql.
--
-- A coordinator is an ordinary member account that an administrator appoints to
-- one ministry (organization). The appointment lets that member:
--
--   * see the ministry in their Coordinator Workspace.
--   * create, edit, duplicate, publish, cancel, and delete the ministry's events.
--   * read the ministry's events in every status, not only the published ones.
--   * review the ministry's join requests (installed separately by
--     supabase/coordinator_join_approvals.sql).
--
-- Coordinators keep their member dashboard: the same account can still set
-- availability and join open slots. They cannot create organizations or appoint
-- other coordinators. Those stay administrator-only.
--
-- The table is idempotent: running this script again does not duplicate rows or
-- policies. It is safe on a project that already has some of it installed.

-- ------------------------------------------------------------------------------
-- 1) The appointments.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_leaders (
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- The coordinator must be a real member account: member_profiles is the row
    -- every member table already points at.
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    appointed_by UUID NULL REFERENCES public.admin_profiles(user_id) ON DELETE SET NULL,
    appointed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_leaders_user
    ON public.organization_leaders(user_id);

-- ------------------------------------------------------------------------------
-- 2) Helper used by the policies below. SECURITY DEFINER so the RLS policies on
--    organization_leaders do not recurse into themselves.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_organization_leader(
    p_organization_id VARCHAR,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_leaders
        WHERE organization_id = p_organization_id
          AND user_id = p_user_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_organization_leader(VARCHAR, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3) "If they are in the certain ministry group": a coordinator must already be
--    an approved member of the ministry they lead. Appointing someone who has
--    not joined it yet is rejected with a readable message.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_organization_leader()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_member_accounts
        WHERE organization_id = NEW.organization_id
          AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION
            'A coordinator must be a member of the ministry they lead. Approve this member''s join request for that ministry first.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_organization_leader ON public.organization_leaders;
CREATE TRIGGER validate_organization_leader
    BEFORE INSERT OR UPDATE ON public.organization_leaders
    FOR EACH ROW EXECUTE FUNCTION public.validate_organization_leader();

-- Removing the membership also removes the coordinator appointment, so access
-- never outlives the member's place in the ministry.
CREATE OR REPLACE FUNCTION public.revoke_leadership_with_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.organization_leaders
    WHERE organization_id = OLD.organization_id
      AND user_id = OLD.user_id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS revoke_leadership_with_membership ON public.organization_member_accounts;
CREATE TRIGGER revoke_leadership_with_membership
    AFTER DELETE ON public.organization_member_accounts
    FOR EACH ROW EXECUTE FUNCTION public.revoke_leadership_with_membership();

-- ------------------------------------------------------------------------------
-- 4) Row Level Security.
--    - administrators appoint and revoke coordinators.
--    - a coordinator can read their own appointments (the app reads them on
--      sign-in to decide which workspace to open).
-- ------------------------------------------------------------------------------
ALTER TABLE public.organization_leaders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators read own appointments" ON public.organization_leaders;
CREATE POLICY "Coordinators read own appointments" ON public.organization_leaders
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage coordinator appointments" ON public.organization_leaders;
CREATE POLICY "Admins manage coordinator appointments" ON public.organization_leaders
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_leaders TO authenticated;

-- A coordinator can read the ministry they lead even while it is inactive; the
-- public policy still limits everybody else to active organizations.
DROP POLICY IF EXISTS "Coordinators read their ministries" ON public.organizations;
CREATE POLICY "Coordinators read their ministries" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_organization_leader(id, auth.uid()));

-- Events: coordinators manage the events of the ministries they lead. The
-- administrator policies installed by schema.sql stay in place and are additive,
-- so an administrator can still manage every event.
DROP POLICY IF EXISTS "Coordinators read ministry events" ON public.events;
CREATE POLICY "Coordinators read ministry events" ON public.events
FOR SELECT TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Coordinators manage ministry events" ON public.events;
CREATE POLICY "Coordinators manage ministry events" ON public.events
FOR ALL TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()))
WITH CHECK (public.is_organization_leader(organization_id, auth.uid()));

-- ------------------------------------------------------------------------------
-- 5) Appoint from the SQL editor (optional; the admin workspace has a search UI)
-- ------------------------------------------------------------------------------

-- A helper restricted to the SQL editor / service role, for projects that want
-- to seed an appointment without opening the app.
CREATE OR REPLACE FUNCTION public.appoint_organization_leader(
    p_organization_id VARCHAR,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.organization_leaders (organization_id, user_id)
    VALUES (p_organization_id, p_user_id)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.appoint_organization_leader(VARCHAR, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.appoint_organization_leader(VARCHAR, UUID)
    TO service_role;

-- SELECT public.appoint_organization_leader(
--     'organization-id',                         -- organizations.id
--     (SELECT id FROM auth.users WHERE lower(email) = lower('member@example.com'))
-- );
--
-- The member must already belong to that ministry. To see the appointments:
-- SELECT l.organization_id, o.name, l.user_id, m.full_name, m.email, l.appointed_at
-- FROM public.organization_leaders l
-- JOIN public.organizations o ON o.id = l.organization_id
-- JOIN public.member_profiles m ON m.user_id = l.user_id
-- ORDER BY o.name, m.full_name;
--
-- To revoke one:
-- DELETE FROM public.organization_leaders
-- WHERE organization_id = 'organization-id'
--   AND user_id = (SELECT id FROM auth.users WHERE lower(email) = lower('member@example.com'));

-- ------------------------------------------------------------------------------
-- 6) Verify.
-- ------------------------------------------------------------------------------
-- Expect the four columns, rls_enabled = true, two policies on
-- organization_leaders, and three coordinator policies on organizations/events.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organization_leaders'
ORDER BY ordinal_position;

SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname = 'organization_leaders';

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('organization_leaders', 'organizations', 'events')
  AND (tablename = 'organization_leaders' OR policyname LIKE '%Coordinators%')
ORDER BY tablename, policyname;
