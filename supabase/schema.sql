-- ==============================================================================
-- E-SKEDYUL: Complete Serverless Supabase SQL Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates all tables, triggers, helper functions, and Row-Level Security (RLS) policies.
-- Section 10 installs direct messaging and the automatic organization group chats
-- (the same definitions as supabase/messaging.sql).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Direct inserts into auth.users are not supported. Remove the legacy helper
-- if it was installed by an earlier version of this schema.
DROP FUNCTION IF EXISTS public.create_admin_account(TEXT, TEXT, TEXT, TEXT);

-- ------------------------------------------------------------------------------
-- 1. PROFILES & ROLES
-- ------------------------------------------------------------------------------

-- Admin profiles (controls administrative privileges)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    role VARCHAR(30) NOT NULL DEFAULT 'admin' CHECK (role = 'admin'),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Member profiles (created automatically when a volunteer registers)
CREATE TABLE IF NOT EXISTS public.member_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NULL,
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    -- FALSE until the member finishes the in-app setup wizard (name + join code).
    -- Social sign-ups already carry the provider's name, so the name alone cannot
    -- tell a new account from a returning one. See supabase/member_onboarding.sql
    -- for projects that installed this schema before the column existed.
    onboarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. ORGANIZATIONS (PARISHES & MINISTRIES)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    contact_email VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Manila',
    address VARCHAR(255) NOT NULL DEFAULT '',
    category VARCHAR(100) NOT NULL DEFAULT 'Parish',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    join_code VARCHAR(32) NOT NULL DEFAULT (
        'ESK-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Administrator assignments to organizations
CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- Member memberships in organizations
CREATE TABLE IF NOT EXISTS public.organization_member_accounts (
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- Ministry coordinators (leaders). An administrator appoints an existing member
-- of a ministry to coordinate it; that account can then create and organise the
-- ministry's events from the Coordinator Workspace. See
-- supabase/organization_leaders.sql for existing projects.
CREATE TABLE IF NOT EXISTS public.organization_leaders (
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    appointed_by UUID NULL REFERENCES public.admin_profiles(user_id) ON DELETE SET NULL,
    appointed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 3. EVENTS & VOLUNTEER SLOTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.events (
    id VARCHAR(40) PRIMARY KEY,
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 50 CHECK (capacity >= 1),
    registration_deadline TIMESTAMPTZ,
    visibility VARCHAR(20) NOT NULL DEFAULT 'members' CHECK (visibility IN ('public', 'members')),
    recurrence VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'weekly', 'monthly')),
    repeat_until TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT events_valid_range CHECK (ends_at > starts_at)
);

-- ------------------------------------------------------------------------------
-- 3A. MEMBER AVAILABILITY, VOLUNTEER SLOTS & ASSIGNMENTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.member_recurring_availability (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    days TEXT[] NOT NULL CHECK (cardinality(days) > 0),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CONSTRAINT recurring_availability_valid_range CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.member_availability_overrides (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    override_type VARCHAR(20) NOT NULL CHECK (override_type IN ('free', 'blocked')),
    start_time TIME,
    end_time TIME,
    CONSTRAINT availability_override_valid_range CHECK (
        (override_type = 'blocked' AND start_time IS NULL AND end_time IS NULL)
        OR
        (override_type = 'free' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE TABLE IF NOT EXISTS public.volunteer_slots (
    id VARCHAR(40) PRIMARY KEY,
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- The specific event this slot belongs to. NULL keeps legacy/sample slots
    -- that are not tied to an event; see supabase/event_volunteer_slots.sql.
    event_id VARCHAR(40) NULL REFERENCES public.events(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    mass_name VARCHAR(180) NOT NULL,
    total_spots INTEGER NOT NULL CHECK (total_spots >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing projects already have volunteer_slots. `CREATE TABLE IF NOT EXISTS`
-- does not add new columns, so make the event link idempotent here as well.
ALTER TABLE public.volunteer_slots
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(40)
        REFERENCES public.events(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.slot_signups (
    slot_id VARCHAR(40) NOT NULL REFERENCES public.volunteer_slots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.member_assignments (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    assignment_time TIME NOT NULL,
    mass_name VARCHAR(180) NOT NULL,
    role VARCHAR(100) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_availability_user ON public.member_recurring_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_user_date ON public.member_availability_overrides(user_id, override_date);
CREATE INDEX IF NOT EXISTS idx_volunteer_slots_date ON public.volunteer_slots(slot_date, slot_time);
CREATE INDEX IF NOT EXISTS idx_volunteer_slots_event ON public.volunteer_slots(event_id);
CREATE INDEX IF NOT EXISTS idx_slot_signups_user ON public.slot_signups(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_date ON public.member_assignments(user_id, assignment_date);

-- ------------------------------------------------------------------------------
-- 4. JOIN REQUESTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_join_requests (
    id VARCHAR(40) PRIMARY KEY DEFAULT ('req-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 12)),
    organization_id VARCHAR(40) NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    member_user_id UUID NULL REFERENCES public.member_profiles(user_id) ON DELETE SET NULL,
    member_name VARCHAR(150) NOT NULL,
    submitted_join_code VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ NULL,
    -- The reviewer is an administrator or the coordinator of this ministry;
    -- both are auth users. See supabase/coordinator_join_approvals.sql.
    reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_note TEXT NOT NULL DEFAULT ''
);

-- ------------------------------------------------------------------------------
-- 5. NOTIFICATIONS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    kind VARCHAR(20) NOT NULL DEFAULT 'schedule'
        CHECK (kind IN ('schedule', 'approval', 'slot', 'event', 'event_reminder')),
    event_id VARCHAR(40) NULL REFERENCES public.events(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event_delivery
    ON public.notifications(user_id, event_id, kind)
    WHERE event_id IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_join_code_ci ON public.organizations(upper(join_code));
CREATE INDEX IF NOT EXISTS idx_organization_leaders_user ON public.organization_leaders(user_id);
CREATE INDEX IF NOT EXISTS idx_events_organization ON public.events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON public.events(starts_at);
CREATE INDEX IF NOT EXISTS ix_join_requests_organization ON public.organization_join_requests(organization_id);

-- ------------------------------------------------------------------------------
-- 5. AUTOMATED TRIGGER: NEW USER REGISTRATION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.member_profiles (user_id, email, full_name, active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
          NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
          NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
          NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', '')), ''),
          -- Phone (SMS OTP) sign-ups have no email address. Fall back to the phone
          -- number so full_name never receives NULL (NOT NULL column) and the
          -- auth.users insert does not fail with "Database error saving new user".
          NULLIF(TRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
          NULLIF(TRIM(COALESCE(NEW.phone, '')), ''),
          'Member'
        ),
        TRUE
    )
    ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = CASE WHEN member_profiles.full_name = '' THEN EXCLUDED.full_name ELSE member_profiles.full_name END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 6. HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

-- Check if a user is an active administrator
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

-- Check whether a user coordinates (leads) a specific ministry. SECURITY DEFINER
-- so the organization_leaders policies below can call it without recursing.
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

-- A coordinator must already belong to the ministry they lead.
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

-- Losing the membership also loses the coordinator appointment.
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

-- Helper function to resolve username or email for admin authentication
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

    -- If identifier contains '@', it is already an email: return lowercased
    IF clean_id LIKE '%@%' THEN
        RETURN lower(clean_id);
    END IF;

    -- Otherwise, look up email by username in admin_profiles
    SELECT email INTO found_email
    FROM public.admin_profiles
    WHERE lower(username) = lower(clean_id)
      AND active = TRUE
    LIMIT 1;

    RETURN found_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_email(TEXT) TO anon, authenticated;

-- Transactional function to review a join request (approve or reject) and, when
-- approved, create the membership row. The caller must be an administrator or
-- the coordinator of the request's own ministry.
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

-- Older app builds call approve_join_request(); keep the name working for both
-- roles while the review function owns the rules.
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

-- Functions are executable by PUBLIC by default, which would include the anon
-- role. Only signed-in administrators and coordinators (and the service role)
-- may call these.
REVOKE ALL ON FUNCTION public.review_join_request(VARCHAR, VARCHAR, UUID, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_join_request(VARCHAR, VARCHAR, UUID, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_join_request(VARCHAR, UUID, TEXT)
    TO authenticated, service_role;

-- Convenience function to promote an existing auth user to admin
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
    -- Match email case-insensitively
    SELECT id, raw_user_meta_data->>'full_name' INTO v_user_id, v_full_name
    FROM auth.users
    WHERE lower(email) = lower(trim(target_email));

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % does not exist in auth.users yet. Create the user through Supabase Auth first.', target_email;
    END IF;

    -- Ensure email is confirmed so user is not blocked by email confirmation
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = v_user_id;

    -- Pick a safe, non-conflicting username
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

-- ------------------------------------------------------------------------------
-- 6A. ADMINISTRATOR PROVISIONING
-- ------------------------------------------------------------------------------
-- Administrators are promoted only from the SQL editor / service role with the
-- make_admin() helper above. There is deliberately no browser-callable promotion
-- function: knowing the public anon key must never grant administrative access.
-- See supabase/promote_to_admin.sql for the copy-paste query.

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_member_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_recurring_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admin Profiles
DROP POLICY IF EXISTS "Read own admin profile or any if admin" ON public.admin_profiles;
CREATE POLICY "Read own admin profile or any if admin" ON public.admin_profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update admin profiles" ON public.admin_profiles;
CREATE POLICY "Admins update admin profiles" ON public.admin_profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Member Profiles
DROP POLICY IF EXISTS "Read own member profile or any if admin" ON public.member_profiles;
CREATE POLICY "Read own member profile or any if admin" ON public.member_profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Update own member profile" ON public.member_profiles;
CREATE POLICY "Update own member profile" ON public.member_profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Availability, slot sign-ups, and join requests reference member_profiles(user_id).
-- The handle_new_user() trigger normally creates the row, but a member must also be
-- able to repair it from the client if the trigger was never installed.
DROP POLICY IF EXISTS "Create own member profile" ON public.member_profiles;
CREATE POLICY "Create own member profile" ON public.member_profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Organizations
DROP POLICY IF EXISTS "Public read active organizations" ON public.organizations;
CREATE POLICY "Public read active organizations" ON public.organizations
FOR SELECT TO anon, authenticated
USING (status = 'active' OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins full manage organizations" ON public.organizations;
CREATE POLICY "Admins full manage organizations" ON public.organizations
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- A coordinator keeps sight of the ministry they lead even when it is inactive.
DROP POLICY IF EXISTS "Coordinators read their ministries" ON public.organizations;
CREATE POLICY "Coordinators read their ministries" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_organization_leader(id, auth.uid()));

-- Events
DROP POLICY IF EXISTS "Authenticated read published events" ON public.events;
CREATE POLICY "Authenticated read published events" ON public.events
FOR SELECT TO authenticated
USING (status = 'published' OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins full manage events" ON public.events;
CREATE POLICY "Admins full manage events" ON public.events
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Coordinators create and organise the events of the ministries they lead. RLS
-- policies are additive, so the administrator policies above still apply to them
-- and to every administrator.
DROP POLICY IF EXISTS "Coordinators read ministry events" ON public.events;
CREATE POLICY "Coordinators read ministry events" ON public.events
FOR SELECT TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Coordinators manage ministry events" ON public.events;
CREATE POLICY "Coordinators manage ministry events" ON public.events
FOR ALL TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()))
WITH CHECK (public.is_organization_leader(organization_id, auth.uid()));

-- Join Requests
DROP POLICY IF EXISTS "Members insert own join requests" ON public.organization_join_requests;
CREATE POLICY "Members insert own join requests" ON public.organization_join_requests
FOR INSERT TO authenticated
WITH CHECK (member_user_id = auth.uid());

DROP POLICY IF EXISTS "Members read own join requests" ON public.organization_join_requests;
CREATE POLICY "Members read own join requests" ON public.organization_join_requests
FOR SELECT TO authenticated
USING (member_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins full manage join requests" ON public.organization_join_requests;
CREATE POLICY "Admins full manage join requests" ON public.organization_join_requests
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- A coordinator reviews the requests of the ministries they lead. Decisions are
-- written through review_join_request(), so no direct UPDATE policy is granted:
-- the coordinator cannot rewrite the applicant or the organization.
DROP POLICY IF EXISTS "Coordinators read ministry join requests" ON public.organization_join_requests;
CREATE POLICY "Coordinators read ministry join requests" ON public.organization_join_requests
FOR SELECT TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()));

-- Memberships
DROP POLICY IF EXISTS "Members read own memberships" ON public.organization_member_accounts;
CREATE POLICY "Members read own memberships" ON public.organization_member_accounts
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins full manage memberships" ON public.organization_member_accounts;
CREATE POLICY "Admins full manage memberships" ON public.organization_member_accounts
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Coordinator appointments: an administrator appoints/revokes them in the
-- "Coordinators" screen; a coordinator can read their own rows so the app can
-- decide which workspace to open on sign-in.
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

-- Availability
DROP POLICY IF EXISTS "Members manage own recurring availability" ON public.member_recurring_availability;
CREATE POLICY "Members manage own recurring availability" ON public.member_recurring_availability
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Members manage own availability overrides" ON public.member_availability_overrides;
CREATE POLICY "Members manage own availability overrides" ON public.member_availability_overrides
FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Slots are visible to signed-in members. Administrators create or edit them,
-- and a ministry's coordinator can do the same for the ministries they lead.
DROP POLICY IF EXISTS "Members read volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Members read volunteer slots" ON public.volunteer_slots
FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Admins manage volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Admins manage volunteer slots" ON public.volunteer_slots
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Coordinators manage ministry volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Coordinators manage ministry volunteer slots" ON public.volunteer_slots
FOR ALL TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()))
WITH CHECK (public.is_organization_leader(organization_id, auth.uid()));

DROP POLICY IF EXISTS "Members read slot signups" ON public.slot_signups;
CREATE POLICY "Members read slot signups" ON public.slot_signups
FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Members manage own slot signups" ON public.slot_signups;
CREATE POLICY "Members manage own slot signups" ON public.slot_signups
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members cancel own slot signups" ON public.slot_signups;
CREATE POLICY "Members cancel own slot signups" ON public.slot_signups
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Coordinators cancel ministry slot signups" ON public.slot_signups;
CREATE POLICY "Coordinators cancel ministry slot signups" ON public.slot_signups
FOR DELETE TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
        SELECT 1
        FROM public.volunteer_slots AS slot
        WHERE slot.id = slot_signups.slot_id
          AND public.is_organization_leader(slot.organization_id, auth.uid())
    )
);

-- Capacity is enforced in the database, not only in the browser: two members
-- tapping the last spot at the same time cannot both take it.
CREATE OR REPLACE FUNCTION public.enforce_slot_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    capacity INTEGER;
    taken INTEGER;
BEGIN
    SELECT total_spots INTO capacity
    FROM public.volunteer_slots
    WHERE id = NEW.slot_id
    FOR UPDATE;

    SELECT COUNT(*) INTO taken
    FROM public.slot_signups
    WHERE slot_id = NEW.slot_id;

    IF capacity IS NOT NULL AND taken >= capacity THEN
        RAISE EXCEPTION 'This volunteer slot is full.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_slot_capacity ON public.slot_signups;
CREATE TRIGGER enforce_slot_capacity
    BEFORE INSERT ON public.slot_signups
    FOR EACH ROW EXECUTE FUNCTION public.enforce_slot_capacity();

-- A cancelled or re-drafted event must not keep accepting volunteers. Deleting
-- the slots also removes their signups through the existing cascade.
CREATE OR REPLACE FUNCTION public.remove_volunteer_slots_for_closed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IN ('cancelled', 'draft')
       AND OLD.status IS DISTINCT FROM NEW.status THEN
        DELETE FROM public.volunteer_slots WHERE event_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS remove_volunteer_slots_for_closed_event ON public.events;
CREATE TRIGGER remove_volunteer_slots_for_closed_event
    AFTER UPDATE OF status ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.remove_volunteer_slots_for_closed_event();

-- The event's volunteer list: an administrator or that ministry's coordinator
-- can read the names behind the signups on the slots they manage.
CREATE OR REPLACE FUNCTION public.list_slot_volunteers(p_slot_ids TEXT[])
RETURNS TABLE (
    slot_id VARCHAR(40),
    user_id UUID,
    full_name TEXT,
    email TEXT,
    signed_up_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        slot.id AS slot_id,
        signup.user_id,
        COALESCE(NULLIF(btrim(profile.full_name), ''), 'Member') AS full_name,
        COALESCE(profile.email, '')::TEXT AS email,
        signup.created_at AS signed_up_at
    FROM public.slot_signups AS signup
    JOIN public.volunteer_slots AS slot
      ON slot.id = signup.slot_id
    LEFT JOIN public.member_profiles AS profile
      ON profile.user_id = signup.user_id
    WHERE slot.id = ANY(p_slot_ids)
      AND (
          public.is_admin(auth.uid())
          OR public.is_organization_leader(slot.organization_id, auth.uid())
      )
    ORDER BY slot.slot_date, slot.slot_time, signup.created_at;
$$;

REVOKE ALL ON FUNCTION public.list_slot_volunteers(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_slot_volunteers(TEXT[]) TO authenticated;

-- Assignments are written by administrators and visible to the assigned member.
DROP POLICY IF EXISTS "Members read own assignments" ON public.member_assignments;
CREATE POLICY "Members read own assignments" ON public.member_assignments
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage assignments" ON public.member_assignments;
CREATE POLICY "Admins manage assignments" ON public.member_assignments
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Notifications are private to the authenticated user who owns them.
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own notifications" ON public.notifications;
CREATE POLICY "Users create own notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
FOR DELETE TO authenticated
USING (user_id = auth.uid());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.notify_published_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'published'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.notifications (user_id, title, message, kind, event_id)
        SELECT
            membership.user_id,
            'New event scheduled',
            format(
                '%s is scheduled for %s at %s.',
                NEW.title,
                to_char(NEW.starts_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY'),
                to_char(NEW.starts_at AT TIME ZONE 'Asia/Manila', 'FMHH12:MI AM')
            ),
            'event',
            NEW.id
        FROM (
            SELECT organization_id, user_id
            FROM public.organization_member_accounts
            WHERE organization_id = NEW.organization_id
            UNION
            SELECT organization_id, user_id
            FROM public.organization_members
            WHERE organization_id = NEW.organization_id
        ) AS membership
        ON CONFLICT (user_id, event_id, kind)
        WHERE event_id IS NOT NULL
        DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_published_event ON public.events;
CREATE TRIGGER notify_published_event
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.notify_published_event();

CREATE OR REPLACE FUNCTION public.create_event_happening_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    INSERT INTO public.notifications (user_id, title, message, kind, event_id)
    SELECT
        membership.user_id,
        'Event is happening now',
        format('%s is happening now at %s.', event.title, event.location),
        'event_reminder',
        event.id
    FROM public.events AS event
    INNER JOIN public.organization_member_accounts AS membership
        ON membership.organization_id = event.organization_id
    WHERE event.status = 'published'
      AND event.starts_at <= NOW()
      AND event.ends_at > NOW()
    ON CONFLICT (user_id, event_id, kind)
    WHERE event_id IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_event_members(p_event_id VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_event public.events%ROWTYPE;
    inserted_count INTEGER;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only administrators can notify event members';
    END IF;

    SELECT * INTO target_event
    FROM public.events
    WHERE id = p_event_id
      AND status = 'published';

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, kind, event_id)
    SELECT
        membership.user_id,
        'New event scheduled',
        format(
            '%s is scheduled for %s at %s.',
            target_event.title,
            to_char(target_event.starts_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY'),
            to_char(target_event.starts_at AT TIME ZONE 'Asia/Manila', 'FMHH12:MI AM')
        ),
        'event',
        target_event.id
    FROM (
        SELECT organization_id, user_id
        FROM public.organization_member_accounts
        WHERE organization_id = target_event.organization_id
        UNION
        SELECT organization_id, user_id
        FROM public.organization_members
        WHERE organization_id = target_event.organization_id
    ) AS membership
    ON CONFLICT (user_id, event_id, kind)
    WHERE event_id IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_event_members(VARCHAR) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. INITIAL SEED DATA (OPTIONAL SAMPLES)
-- ------------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, description, category, status, join_code)
VALUES
    ('org-lectors', 'Lectors Ministry', 'Proclaimers of the Word', 'Lectors', 'active', 'ESK-LECTOR2025'),
    ('org-altar', 'Altar Servers', 'Serving at the Holy Altar', 'Altar Servers', 'active', 'ESK-ALTAR2025'),
    ('org-choir', 'Parish Music Ministry', 'Liturgical Choir and Musicians', 'Choir', 'active', 'ESK-CHOIR2025')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. ADMIN ACCOUNT PROVISIONING (SQL EDITOR ONLY)
-- ------------------------------------------------------------------------------
-- 1. Create the user through the Supabase Auth Dashboard or the application.
-- 2. Run this query in the SQL Editor to promote that Auth user:
--    SELECT public.make_admin('your-registered-email@example.com', 'admin');
--
-- A self-contained copy-paste version (no dependency on make_admin) lives in
-- supabase/promote_to_admin.sql.
--
-- The account can then sign in on the admin screen with its email address or its
-- admin username. No promotion control is exposed to the browser.

-- ==============================================================================
-- 10. MESSAGING: DIRECT CHATS & AUTOMATIC ORGANIZATION GROUP CHATS
-- ==============================================================================
-- This section is identical to supabase/messaging.sql, which can be run on its
-- own to add messaging to a project that already installed this schema. Keep the
-- two copies in sync.

-- ==============================================================================
-- E-SKEDYUL: Messaging (direct messages + automatic organization group chats)
-- ==============================================================================
-- Run once in Supabase Dashboard -> SQL Editor -> New query on a project that
-- already installed supabase/schema.sql.
--
-- What this installs
--   chat_conversations   one row per private chat or organization group chat
--   chat_participants    who belongs to each chat, plus their read marker
--   chat_messages        the messages themselves
--
-- Behaviour
--   * Every organization owns exactly ONE group chat. Creating an organization
--     creates that chat, and every approved member of the organization (plus
--     every administrator assigned to it) is added as a participant. Approving a
--     join request therefore also joins the member to the group chat; removing
--     the membership removes them again.
--   * Any two accounts can start a private conversation. Members find each other
--     with search_member_accounts(), which matches names and email addresses but
--     returns email addresses masked.
--   * Group chat managers (administrators and the ministry's coordinator) can
--     switch the group between open discussion and announcements only, and can
--     mute individual members. The message INSERT policy enforces this, so it
--     cannot be bypassed by calling PostgREST directly.
--   * get_conversation_participants() also reports each member's role and shared
--     ministries, which is what the member list, message role badges, and profile
--     sheet in the app read.
--   * RLS keeps every conversation, participant row, and message visible only to
--     the accounts in that conversation. There is no administrator back door into
--     private chats.
--
-- The script is idempotent and safe to run again. Re-running it also upgrades an
-- earlier messaging install (the new columns are added, and the participant RPC
-- is recreated). Existing organizations and their current members are backfilled
-- at the end.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('direct', 'organization')),
    -- The organization whose members share this group chat. One chat per org.
    organization_id VARCHAR(40) NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- The same pair of accounts always maps to the same direct conversation.
    -- Sorted "A:B" user ids, NULL for organization chats.
    direct_key TEXT NULL UNIQUE,
    -- The group title (the organization name). Direct chats derive their title
    -- from the other participant, so it stays empty for them.
    title VARCHAR(150) NOT NULL DEFAULT '',
    -- Group-wide posting policy. 'everyone' lets approved members post;
    -- 'leaders' turns the group into announcements only: administrators and
    -- coordinators keep posting, members can still read.
    posting_mode VARCHAR(20) NOT NULL DEFAULT 'everyone',
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_conversations_posting_mode_check
        CHECK (posting_mode IN ('everyone', 'leaders')),
    CONSTRAINT chat_conversations_target CHECK (
        (kind = 'direct' AND organization_id IS NULL AND direct_key IS NOT NULL)
        OR
        (kind = 'organization' AND organization_id IS NOT NULL AND direct_key IS NULL)
    )
);

-- Existing projects installed chat_conversations before posting modes existed.
ALTER TABLE public.chat_conversations
    ADD COLUMN IF NOT EXISTS posting_mode VARCHAR(20) NOT NULL DEFAULT 'everyone';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.chat_conversations'::regclass
          AND conname = 'chat_conversations_posting_mode_check'
    ) THEN
        ALTER TABLE public.chat_conversations
            ADD CONSTRAINT chat_conversations_posting_mode_check
            CHECK (posting_mode IN ('everyone', 'leaders'));
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.chat_participants (
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Messages created after this moment count as unread for this account.
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- FALSE when an administrator or coordinator has muted this member in this
    -- group. Leaders and administrators ignore this flag and can always post.
    can_post BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (conversation_id, user_id)
);

-- Existing projects installed chat_participants before individual muting existed.
ALTER TABLE public.chat_participants
    ADD COLUMN IF NOT EXISTS can_post BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_messages_body_length CHECK (
        char_length(btrim(body)) BETWEEN 1 AND 4000
    )
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user
    ON public.chat_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON public.chat_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
    ON public.chat_messages(sender_id);

-- ------------------------------------------------------------------------------
-- 2. HELPERS
-- ------------------------------------------------------------------------------

-- Membership test used by the policies below. It always checks the signed-in
-- account, so it cannot be used to probe anybody else's conversations.
-- SECURITY DEFINER so the policies on chat_participants do not recurse into
-- themselves.
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.chat_participants
        WHERE conversation_id = p_conversation_id
          AND user_id = auth.uid()
    );
$$;

-- Search results never expose a whole email address to other members.
CREATE OR REPLACE FUNCTION public.mask_chat_email(p_email TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_email IS NULL OR position('@' IN p_email) = 0 THEN NULL
        ELSE left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2)
    END;
$$;

-- Whether the signed-in account may send into this conversation.
--
--   * every participant of a private chat may send.
--   * an administrator or the ministry's coordinator may always send in the
--     ministry's group chat, even in announcements-only mode.
--   * everybody else may send only when the group is open AND their individual
--     mute is off.
--
-- This is the single source of truth used by the message INSERT policy, so the
-- controls cannot be bypassed by calling PostgREST directly.
CREATE OR REPLACE FUNCTION public.can_i_post_to_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        JOIN public.chat_participants AS participant
          ON participant.conversation_id = conversation.id
         AND participant.user_id = auth.uid()
        WHERE conversation.id = p_conversation_id
          AND (
              conversation.kind = 'direct'
              OR EXISTS (
                  SELECT 1
                  FROM public.admin_profiles AS admin
                  WHERE admin.user_id = auth.uid()
                    AND admin.role = 'admin'
                    AND admin.active = TRUE
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.organization_leaders AS leader
                  WHERE leader.organization_id = conversation.organization_id
                    AND leader.user_id = auth.uid()
              )
              OR (
                  conversation.posting_mode = 'everyone'
                  AND participant.can_post = TRUE
              )
          )
    );
$$;

-- Whether the signed-in account may manage this group chat's posting policy.
-- Only administrators and the coordinator of the conversation's own ministry
-- qualify, and only while they are a participant of the chat.
CREATE OR REPLACE FUNCTION public.can_manage_conversation(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.is_chat_participant(p_conversation_id) AND EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        WHERE conversation.id = p_conversation_id
          AND conversation.kind = 'organization'
          AND (
              EXISTS (
                  SELECT 1
                  FROM public.admin_profiles AS admin
                  WHERE admin.user_id = auth.uid()
                    AND admin.role = 'admin'
                    AND admin.active = TRUE
              )
              OR EXISTS (
                  SELECT 1
                  FROM public.organization_leaders AS leader
                  WHERE leader.organization_id = conversation.organization_id
                    AND leader.user_id = auth.uid()
              )
          )
    );
$$;

-- ------------------------------------------------------------------------------
-- 3. ACCOUNT SEARCH
-- ------------------------------------------------------------------------------
-- Signed-in accounts can look each other up by full name or email address. The
-- member_profiles table itself stays private; this function is the only read path
-- another member gets, and it returns a masked email plus one shared ministry
-- (when there is one) so people with the same name can be told apart.

CREATE OR REPLACE FUNCTION public.search_member_accounts(p_query TEXT)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    masked_email TEXT,
    shared_organization TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH input AS (
        SELECT lower(btrim(COALESCE(p_query, ''))) AS q
    )
    SELECT
        mp.user_id,
        COALESCE(NULLIF(btrim(mp.full_name), ''), 'Member') AS full_name,
        public.mask_chat_email(mp.email) AS masked_email,
        (
            SELECT organization.name
            FROM public.organization_member_accounts AS mine
            JOIN public.organization_member_accounts AS theirs
              ON theirs.organization_id = mine.organization_id
            JOIN public.organizations AS organization
              ON organization.id = mine.organization_id
            WHERE mine.user_id = auth.uid()
              AND theirs.user_id = mp.user_id
            ORDER BY organization.name
            LIMIT 1
        ) AS shared_organization
    FROM public.member_profiles AS mp
    CROSS JOIN input
    WHERE auth.uid() IS NOT NULL
      AND mp.user_id <> auth.uid()
      AND mp.active = TRUE
      AND char_length(input.q) >= 2
      AND (
          position(input.q IN lower(mp.full_name)) > 0
          OR position(input.q IN lower(COALESCE(mp.email, ''))) > 0
      )
    ORDER BY
        (lower(btrim(mp.full_name)) = input.q) DESC,
        mp.full_name ASC
    LIMIT 20;
$$;

-- ------------------------------------------------------------------------------
-- 4. CONVERSATIONS
-- ------------------------------------------------------------------------------

-- Returns the private conversation for the signed-in account and the given
-- account, creating it (and both participant rows) the first time.
CREATE OR REPLACE FUNCTION public.start_direct_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
    v_key TEXT;
    v_conversation UUID;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Sign in to start a conversation.';
    END IF;

    IF p_other_user_id IS NULL OR p_other_user_id = v_me THEN
        RAISE EXCEPTION 'Choose another account to message.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.member_profiles
        WHERE user_id = p_other_user_id
          AND active = TRUE
    ) THEN
        RAISE EXCEPTION 'That account is not available for messaging.';
    END IF;

    -- Sorting the pair makes the key stable no matter who opens the chat.
    v_key := LEAST(v_me, p_other_user_id)::text
          || ':' || GREATEST(v_me, p_other_user_id)::text;

    INSERT INTO public.chat_conversations (kind, direct_key, title, created_by)
    VALUES ('direct', v_key, '', v_me)
    ON CONFLICT (direct_key) DO NOTHING;

    SELECT id INTO v_conversation
    FROM public.chat_conversations
    WHERE direct_key = v_key;

    INSERT INTO public.chat_participants (conversation_id, user_id)
    VALUES (v_conversation, v_me)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    INSERT INTO public.chat_participants (conversation_id, user_id)
    VALUES (v_conversation, p_other_user_id)
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation;
END;
$$;

-- Creates/repairs the group chat of one organization and makes sure every
-- current member and assigned administrator is a participant. Returns the chat
-- id, or NULL when the organization does not exist.
CREATE OR REPLACE FUNCTION public.ensure_organization_chat(p_organization_id VARCHAR)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_name TEXT;
    v_conversation UUID;
BEGIN
    SELECT name INTO v_name
    FROM public.organizations
    WHERE id = p_organization_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.chat_conversations (kind, organization_id, title)
    VALUES ('organization', p_organization_id, v_name)
    ON CONFLICT (organization_id) DO UPDATE
        SET title = EXCLUDED.title
    RETURNING id INTO v_conversation;

    -- Approved members of the organization.
    INSERT INTO public.chat_participants (conversation_id, user_id)
    SELECT v_conversation, membership.user_id
    FROM public.organization_member_accounts AS membership
    WHERE membership.organization_id = p_organization_id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- Administrators assigned to the organization in the admin workspace.
    INSERT INTO public.chat_participants (conversation_id, user_id)
    SELECT v_conversation, assignment.user_id
    FROM public.organization_members AS assignment
    WHERE assignment.organization_id = p_organization_id
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    RETURN v_conversation;
END;
$$;

-- Everything the inbox needs in one round trip: title, last message, unread
-- count, and the other person in a private chat.
CREATE OR REPLACE FUNCTION public.list_my_conversations()
RETURNS TABLE (
    conversation_id UUID,
    kind VARCHAR(20),
    title TEXT,
    organization_id VARCHAR(40),
    other_user_id UUID,
    other_user_name TEXT,
    other_user_masked_email TEXT,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER,
    member_count INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        conversation.id AS conversation_id,
        conversation.kind,
        COALESCE(NULLIF(btrim(conversation.title), ''), other.full_name, 'Conversation') AS title,
        conversation.organization_id,
        other.user_id AS other_user_id,
        other.full_name AS other_user_name,
        public.mask_chat_email(other.email) AS other_user_masked_email,
        COALESCE(latest.body, '') AS last_message,
        COALESCE(latest.created_at, conversation.created_at) AS last_message_at,
        COALESCE(unread.count, 0)::INTEGER AS unread_count,
        (
            SELECT COUNT(*)::INTEGER
            FROM public.chat_participants AS everyone
            WHERE everyone.conversation_id = conversation.id
        ) AS member_count
    FROM public.chat_participants AS me
    JOIN public.chat_conversations AS conversation
      ON conversation.id = me.conversation_id
    LEFT JOIN LATERAL (
        SELECT
            participant.user_id,
            COALESCE(NULLIF(btrim(profile.full_name), ''), 'Member') AS full_name,
            profile.email
        FROM public.chat_participants AS participant
        LEFT JOIN public.member_profiles AS profile
          ON profile.user_id = participant.user_id
        WHERE participant.conversation_id = conversation.id
          AND participant.user_id <> me.user_id
        ORDER BY participant.joined_at ASC
        LIMIT 1
    ) AS other ON conversation.kind = 'direct'
    LEFT JOIN LATERAL (
        SELECT message.body, message.created_at
        FROM public.chat_messages AS message
        WHERE message.conversation_id = conversation.id
        ORDER BY message.created_at DESC
        LIMIT 1
    ) AS latest ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM public.chat_messages AS message
        WHERE message.conversation_id = conversation.id
          AND message.sender_id <> me.user_id
          AND message.created_at > me.last_read_at
    ) AS unread ON TRUE
    WHERE me.user_id = auth.uid()
    ORDER BY COALESCE(latest.created_at, conversation.created_at) DESC;
$$;

-- Names, roles, and profiles shown in the chat header, member list, and message
-- bubbles. The caller must belong to the conversation.
DROP FUNCTION IF EXISTS public.get_conversation_participants(UUID);

CREATE OR REPLACE FUNCTION public.get_conversation_participants(p_conversation_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    masked_email TEXT,
    is_self BOOLEAN,
    role TEXT,
    can_post BOOLEAN,
    joined_at TIMESTAMPTZ,
    shared_organizations TEXT[]
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        participant.user_id,
        COALESCE(NULLIF(btrim(profile.full_name), ''), 'Member') AS full_name,
        public.mask_chat_email(profile.email) AS masked_email,
        (participant.user_id = auth.uid()) AS is_self,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM public.admin_profiles AS admin
                WHERE admin.user_id = participant.user_id
                  AND admin.role = 'admin'
                  AND admin.active = TRUE
            ) THEN 'admin'
            WHEN EXISTS (
                SELECT 1
                FROM public.chat_conversations AS conversation
                JOIN public.organization_leaders AS leader
                  ON leader.organization_id = conversation.organization_id
                WHERE conversation.id = p_conversation_id
                  AND leader.user_id = participant.user_id
            ) THEN 'leader'
            WHEN EXISTS (
                SELECT 1
                FROM public.chat_conversations AS conversation
                WHERE conversation.id = p_conversation_id
                  AND conversation.kind = 'direct'
                  AND EXISTS (
                      SELECT 1
                      FROM public.organization_leaders AS leader
                      WHERE leader.user_id = participant.user_id
                  )
            ) THEN 'leader'
            ELSE 'member'
        END AS role,
        participant.can_post,
        participant.joined_at,
        ARRAY(
            SELECT organization.name
            FROM public.organization_member_accounts AS mine
            JOIN public.organization_member_accounts AS theirs
              ON theirs.organization_id = mine.organization_id
            JOIN public.organizations AS organization
              ON organization.id = mine.organization_id
            WHERE mine.user_id = auth.uid()
              AND theirs.user_id = participant.user_id
            ORDER BY organization.name
        ) AS shared_organizations
    FROM public.chat_participants AS participant
    LEFT JOIN public.member_profiles AS profile
      ON profile.user_id = participant.user_id
    WHERE participant.conversation_id = p_conversation_id
      AND public.is_chat_participant(p_conversation_id)
    ORDER BY participant.joined_at ASC;
$$;

-- Everything the chat screen needs to decide who may post and whether to show
-- the management controls. Private chats have no management and always allow
-- both participants to post.
DROP FUNCTION IF EXISTS public.get_conversation_settings(UUID);

CREATE OR REPLACE FUNCTION public.get_conversation_settings(p_conversation_id UUID)
RETURNS TABLE (
    conversation_id UUID,
    kind VARCHAR(20),
    organization_id VARCHAR(40),
    posting_mode VARCHAR(20),
    can_manage BOOLEAN,
    can_post BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        conversation.id AS conversation_id,
        conversation.kind,
        conversation.organization_id,
        CASE
            WHEN conversation.kind = 'organization' THEN conversation.posting_mode
            ELSE 'everyone'
        END AS posting_mode,
        public.can_manage_conversation(conversation.id) AS can_manage,
        public.can_i_post_to_conversation(conversation.id) AS can_post
    FROM public.chat_conversations AS conversation
    WHERE conversation.id = p_conversation_id
      AND public.is_chat_participant(conversation.id);
$$;

-- Switch a ministry group between open discussion and announcements only.
CREATE OR REPLACE FUNCTION public.update_chat_group_settings(
    p_conversation_id UUID,
    p_posting_mode VARCHAR
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_manage_conversation(p_conversation_id) THEN
        RAISE EXCEPTION 'Only an administrator or the ministry coordinator can change this chat.';
    END IF;

    IF p_posting_mode NOT IN ('everyone', 'leaders') THEN
        RAISE EXCEPTION 'Choose either everyone or leaders for the posting mode.';
    END IF;

    UPDATE public.chat_conversations
    SET posting_mode = p_posting_mode
    WHERE id = p_conversation_id
      AND kind = 'organization';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'That group chat was not found.';
    END IF;
END;
$$;

-- Mute or unmute one regular member of a ministry group. Administrators and
-- coordinators always keep posting access, so they cannot be muted.
CREATE OR REPLACE FUNCTION public.set_chat_member_can_post(
    p_conversation_id UUID,
    p_user_id UUID,
    p_can_post BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.can_manage_conversation(p_conversation_id) THEN
        RAISE EXCEPTION 'Only an administrator or the ministry coordinator can change this chat.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot change your own posting access.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.admin_profiles AS admin
        WHERE admin.user_id = p_user_id
          AND admin.role = 'admin'
          AND admin.active = TRUE
    ) OR EXISTS (
        SELECT 1
        FROM public.chat_conversations AS conversation
        JOIN public.organization_leaders AS leader
          ON leader.organization_id = conversation.organization_id
        WHERE conversation.id = p_conversation_id
          AND leader.user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Administrators and coordinators always keep posting access.';
    END IF;

    UPDATE public.chat_participants
    SET can_post = p_can_post
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'That member is not in this chat.';
    END IF;
END;
$$;

-- Moves the read marker to now, which clears the unread badge in the inbox.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.chat_participants
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND user_id = auth.uid();
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. AUTOMATIC ORGANIZATION GROUP CHATS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_organization_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation UUID;
BEGIN
    v_conversation := public.ensure_organization_chat(NEW.id);

    -- The administrator who creates (or renames) the organization joins its
    -- group chat, so it appears in their admin workspace Messages section and
    -- they can manage it. Administrators assigned later join through the
    -- organization_members trigger below.
    IF v_conversation IS NOT NULL
       AND EXISTS (
           SELECT 1
           FROM public.admin_profiles AS admin
           WHERE admin.user_id = auth.uid()
             AND admin.role = 'admin'
             AND admin.active = TRUE
       ) THEN
        INSERT INTO public.chat_participants (conversation_id, user_id)
        VALUES (v_conversation, auth.uid())
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_member_to_organization_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation UUID;
BEGIN
    v_conversation := public.ensure_organization_chat(NEW.organization_id);

    IF v_conversation IS NOT NULL THEN
        INSERT INTO public.chat_participants (conversation_id, user_id)
        VALUES (v_conversation, NEW.user_id)
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_member_from_organization_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- The same account can be an approved member and an assigned administrator
    -- of the organization. Only drop chat access when neither row remains.
    IF EXISTS (
        SELECT 1
        FROM public.organization_member_accounts
        WHERE organization_id = OLD.organization_id
          AND user_id = OLD.user_id
    ) OR EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = OLD.organization_id
          AND user_id = OLD.user_id
    ) THEN
        RETURN OLD;
    END IF;

    DELETE FROM public.chat_participants AS participant
    USING public.chat_conversations AS conversation
    WHERE participant.conversation_id = conversation.id
      AND conversation.organization_id = OLD.organization_id
      AND participant.user_id = OLD.user_id;

    RETURN OLD;
END;
$$;

-- A newly created organization gets its group chat immediately.
DROP TRIGGER IF EXISTS create_organization_chat ON public.organizations;
CREATE TRIGGER create_organization_chat
    AFTER INSERT OR UPDATE OF name ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.sync_organization_chat();

-- An approved join request inserts organization_member_accounts, which joins the
-- member to the group chat.
DROP TRIGGER IF EXISTS add_member_to_organization_chat ON public.organization_member_accounts;
CREATE TRIGGER add_member_to_organization_chat
    AFTER INSERT ON public.organization_member_accounts
    FOR EACH ROW EXECUTE FUNCTION public.add_member_to_organization_chat();

DROP TRIGGER IF EXISTS remove_member_from_organization_chat ON public.organization_member_accounts;
CREATE TRIGGER remove_member_from_organization_chat
    AFTER DELETE ON public.organization_member_accounts
    FOR EACH ROW EXECUTE FUNCTION public.remove_member_from_organization_chat();

-- Administrators assigned to an organization join its group chat too.
DROP TRIGGER IF EXISTS add_admin_to_organization_chat ON public.organization_members;
CREATE TRIGGER add_admin_to_organization_chat
    AFTER INSERT ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.add_member_to_organization_chat();

DROP TRIGGER IF EXISTS remove_admin_from_organization_chat ON public.organization_members;
CREATE TRIGGER remove_admin_from_organization_chat
    AFTER DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.remove_member_from_organization_chat();

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
-- Conventions used here:
--   * conversations and messages are visible only to their participants.
--   * participants can read the other participants of their own conversations.
--   * only participants can write a message, and only as themselves.
--   * read markers are written through mark_conversation_read() because a direct
--     UPDATE grant on chat_participants would let a member change their row's
--     conversation_id and add themselves to somebody else's conversation.
--   * rows are created by the SECURITY DEFINER functions/triggers above, so there
--     are deliberately no INSERT policies for conversations or participants.

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read their conversations" ON public.chat_conversations;
CREATE POLICY "Participants read their conversations" ON public.chat_conversations
FOR SELECT TO authenticated
USING (public.is_chat_participant(id));

DROP POLICY IF EXISTS "Participants read their chat membership" ON public.chat_participants;
CREATE POLICY "Participants read their chat membership" ON public.chat_participants
FOR SELECT TO authenticated
USING (public.is_chat_participant(conversation_id));

DROP POLICY IF EXISTS "Participants read conversation messages" ON public.chat_messages;
CREATE POLICY "Participants read conversation messages" ON public.chat_messages
FOR SELECT TO authenticated
USING (public.is_chat_participant(conversation_id));

DROP POLICY IF EXISTS "Participants send conversation messages" ON public.chat_messages;
CREATE POLICY "Participants send conversation messages" ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND public.can_i_post_to_conversation(conversation_id)
);

DROP POLICY IF EXISTS "Senders delete their own messages" ON public.chat_messages;
CREATE POLICY "Senders delete their own messages" ON public.chat_messages
FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- Table privileges. RLS already limits the rows; this also keeps the public anon
-- role out of the tables entirely and ensures the only UPDATE path on
-- chat_participants is the SECURITY DEFINER RPC above.
REVOKE ALL ON TABLE public.chat_conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_participants FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_messages FROM anon, authenticated;

GRANT SELECT ON TABLE public.chat_conversations TO authenticated;
GRANT SELECT ON TABLE public.chat_participants TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_messages TO authenticated;

-- Function privileges. PostgreSQL grants EXECUTE to PUBLIC by default; close that
-- for the public anon key and keep the member-facing RPCs available to signed-in
-- accounts only.
REVOKE ALL ON FUNCTION public.is_chat_participant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.mask_chat_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_chat_email(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.search_member_accounts(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_member_accounts(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.start_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_direct_conversation(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_conversations() TO authenticated;

REVOKE ALL ON FUNCTION public.get_conversation_participants(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_participants(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_i_post_to_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_i_post_to_conversation(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_manage_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_conversation(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_conversation_settings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_settings(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.update_chat_group_settings(UUID, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_chat_group_settings(UUID, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.set_chat_member_can_post(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_member_can_post(UUID, UUID, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_organization_chat(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_organization_chat(VARCHAR) TO service_role;

REVOKE ALL ON FUNCTION public.sync_organization_chat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_member_to_organization_chat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_member_from_organization_chat() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. BACKFILL EXISTING ORGANIZATIONS
-- ------------------------------------------------------------------------------
-- Organizations created before this script have no group chat yet, and their
-- current members are not participants. Run this helper any time to repair them
-- all; it is idempotent.
CREATE OR REPLACE FUNCTION public.backfill_organization_chats()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    organization RECORD;
    processed INTEGER := 0;
BEGIN
    FOR organization IN SELECT id FROM public.organizations LOOP
        PERFORM public.ensure_organization_chat(organization.id);
        processed := processed + 1;
    END LOOP;

    RETURN processed;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_organization_chats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_organization_chats() TO service_role;

-- Apply the backfill now so the app works immediately after this script runs.
SELECT public.backfill_organization_chats() AS organization_chats_ready;

-- ------------------------------------------------------------------------------
-- 8. REALTIME
-- ------------------------------------------------------------------------------
-- New messages and newly added participants stream to the open app.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
    END IF;
END
$$;

-- ------------------------------------------------------------------------------
-- 9. VERIFY (read-only)
-- ------------------------------------------------------------------------------
-- Expect three tables with RLS enabled, five policies, one group chat per
-- organization, and a participant row per organization member.

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('chat_conversations', 'chat_participants', 'chat_messages')
ORDER BY table_name, ordinal_position;

SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('chat_conversations', 'chat_participants', 'chat_messages')
ORDER BY relname;

SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_conversations', 'chat_participants', 'chat_messages')
ORDER BY tablename, policyname;

SELECT
    organization.id,
    organization.name,
    conversation.id AS chat_id,
    conversation.posting_mode,
    COUNT(participant.user_id) AS chat_members,
    COUNT(*) FILTER (WHERE participant.can_post) AS members_can_send
FROM public.organizations AS organization
LEFT JOIN public.chat_conversations AS conversation
  ON conversation.organization_id = organization.id
LEFT JOIN public.chat_participants AS participant
  ON participant.conversation_id = conversation.id
GROUP BY organization.id, organization.name, conversation.id, conversation.posting_mode
ORDER BY organization.name;
