
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admin_profiles (
    user_id UUID PRIMARY KEY
        REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(80) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    role VARCHAR(30) NOT NULL DEFAULT 'admin'
        CHECK (role = 'admin'),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    full_name VARCHAR(150) NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organizations (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    contact_email VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Manila',
    address VARCHAR(255) NOT NULL DEFAULT '',
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    join_code VARCHAR(32) NOT NULL UNIQUE DEFAULT (
        'ESK-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))
    ),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.events (
    id VARCHAR(40) PRIMARY KEY,
    organization_id VARCHAR(40) NOT NULL
        REFERENCES public.organizations(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 50
        CHECK (capacity >= 1),
    registration_deadline TIMESTAMPTZ,
    visibility VARCHAR(20) NOT NULL DEFAULT 'members'
        CHECK (visibility IN ('public', 'members')),
    recurrence VARCHAR(20) NOT NULL DEFAULT 'none'
        CHECK (recurrence IN ('none', 'weekly', 'monthly')),
    repeat_until TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'published',
                'cancelled',
                'completed'
            )
        ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT events_valid_range
        CHECK (ends_at > starts_at),

    CONSTRAINT events_valid_registration
        CHECK (
            registration_deadline IS NULL
            OR registration_deadline <= starts_at
        ),

    CONSTRAINT events_valid_recurrence
        CHECK (
            (recurrence = 'none' AND repeat_until IS NULL)
            OR
            (recurrence <> 'none' AND repeat_until IS NOT NULL)
        )
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id VARCHAR(40) NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.admin_profiles(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_member_accounts (
    organization_id VARCHAR(40) NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_join_requests (
    id VARCHAR(40) PRIMARY KEY,
    organization_id VARCHAR(40) NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    member_user_id UUID
        REFERENCES public.member_profiles(user_id) ON DELETE SET NULL,
    member_name VARCHAR(150) NOT NULL,
    submitted_join_code VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewer_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.member_recurring_availability (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL
        REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    days TEXT[] NOT NULL CHECK (cardinality(days) > 0),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CONSTRAINT recurring_availability_valid_range
        CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS public.member_availability_overrides (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL
        REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    override_date DATE NOT NULL,
    override_type VARCHAR(20) NOT NULL
        CHECK (override_type IN ('free', 'blocked')),
    start_time TIME,
    end_time TIME,
    CONSTRAINT availability_override_valid_range CHECK (
        (override_type = 'blocked' AND start_time IS NULL AND end_time IS NULL)
        OR
        (override_type = 'free' AND start_time IS NOT NULL
            AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE TABLE IF NOT EXISTS public.volunteer_slots (
    id VARCHAR(40) PRIMARY KEY,
    organization_id VARCHAR(40) NOT NULL
        REFERENCES public.organizations(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    mass_name VARCHAR(180) NOT NULL,
    total_spots INTEGER NOT NULL CHECK (total_spots >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.slot_signups (
    slot_id VARCHAR(40) NOT NULL
        REFERENCES public.volunteer_slots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL
        REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.member_assignments (
    id VARCHAR(40) PRIMARY KEY,
    user_id UUID NOT NULL
        REFERENCES public.member_profiles(user_id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    assignment_time TIME NOT NULL,
    mass_name VARCHAR(180) NOT NULL,
    role VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    kind VARCHAR(20) NOT NULL DEFAULT 'schedule'
        CHECK (kind IN ('schedule', 'approval', 'slot', 'event', 'event_reminder')),
    event_id VARCHAR(40) REFERENCES public.events(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_availability_user
    ON public.member_recurring_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_overrides_user_date
    ON public.member_availability_overrides(user_id, override_date);
CREATE INDEX IF NOT EXISTS idx_volunteer_slots_date
    ON public.volunteer_slots(slot_date, slot_time);
CREATE INDEX IF NOT EXISTS idx_slot_signups_user
    ON public.slot_signups(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_date
    ON public.member_assignments(user_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_profiles_username
    ON public.admin_profiles(username);

CREATE INDEX IF NOT EXISTS idx_organizations_status
    ON public.organizations(status);

CREATE INDEX IF NOT EXISTS idx_events_organization
    ON public.events(organization_id);

CREATE INDEX IF NOT EXISTS idx_events_starts_at
    ON public.events(starts_at);

CREATE INDEX IF NOT EXISTS idx_events_status
    ON public.events(status);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
    ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_join_requests_status
    ON public.organization_join_requests(status);

CREATE INDEX IF NOT EXISTS idx_join_requests_requested_at
    ON public.organization_join_requests(requested_at DESC);

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.admin_profiles
        WHERE user_id = uid
          AND role = 'admin'
          AND active = TRUE
    );
$$;

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_create_join_requests
    ON public.organization_join_requests;

CREATE POLICY public_create_join_requests
ON public.organization_join_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (TRUE);

DROP POLICY IF EXISTS admin_manage_join_requests
    ON public.organization_join_requests;

CREATE POLICY admin_manage_join_requests
ON public.organization_join_requests
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_profile_self_read
    ON public.admin_profiles;

CREATE POLICY admin_profile_self_read
ON public.admin_profiles
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS admin_manage_organizations
    ON public.organizations;

CREATE POLICY admin_manage_organizations
ON public.organizations
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_manage_events
    ON public.events;

CREATE POLICY admin_manage_events
ON public.events
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_manage_organization_members
    ON public.organization_members;

CREATE POLICY admin_manage_organization_members
ON public.organization_members
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
