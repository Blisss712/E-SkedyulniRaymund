-- ==============================================================================
-- E-SKEDYUL: Complete Serverless Supabase SQL Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query).
-- It creates all tables, triggers, helper functions, and Row-Level Security (RLS) policies.

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
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    mass_name VARCHAR(180) NOT NULL,
    total_spots INTEGER NOT NULL CHECK (total_spots >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    reviewed_by UUID NULL REFERENCES public.admin_profiles(user_id) ON DELETE SET NULL,
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
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
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

-- Transactional function to approve a join request and create membership
CREATE OR REPLACE FUNCTION public.approve_join_request(req_id VARCHAR, reviewer_id UUID, note TEXT DEFAULT '')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_req RECORD;
BEGIN
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

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_member_accounts ENABLE ROW LEVEL SECURITY;
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

-- Slots are visible to signed-in members. Only administrators create or edit them.
DROP POLICY IF EXISTS "Members read volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Members read volunteer slots" ON public.volunteer_slots
FOR SELECT TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS "Admins manage volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Admins manage volunteer slots" ON public.volunteer_slots
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

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
-- 9. ADMIN ACCOUNT PROVISIONING (RUN SEPARATELY ONCE AS NEEDED)
-- ------------------------------------------------------------------------------
-- After running this schema:
-- 1. Create the user through the Supabase Auth Dashboard or the application.
-- 2. Run this query in the SQL Editor to promote that Auth user:
-- SELECT public.make_admin('your-registered-email@example.com', 'admin');
