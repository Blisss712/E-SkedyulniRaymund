
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

CREATE TABLE IF NOT EXISTS public.organizations (
    id VARCHAR(40) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    contact_email VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Manila',
    address VARCHAR(255) NOT NULL DEFAULT '',
    category VARCHAR(100) NOT NULL DEFAULT 'General',
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
