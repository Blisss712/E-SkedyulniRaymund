-- ==============================================================================
-- E-SKEDYUL: Event-linked volunteer slots
-- ==============================================================================
-- Run this once in Supabase Dashboard -> SQL Editor -> New query on a project
-- that already installed supabase/schema.sql.
--
-- It makes a volunteer slot belong to one specific upcoming event, and lets an
-- administrator OR the coordinator/leader of that ministry:
--
--   * open a volunteer slot for the event (date, arrival time, number of spots),
--   * read the list of volunteers who signed up,
--   * remove a volunteer or delete the slot.
--
-- Members keep volunteering from the Open Slots tab. Their signup is already
-- linked to the slot, so the event's volunteer list updates automatically.
--
-- The script is idempotent: running it again does not duplicate the column,
-- constraint, indexes, policies, or function.

BEGIN;

-- ------------------------------------------------------------------------------
-- 1) Link a slot to an event.
-- ------------------------------------------------------------------------------
ALTER TABLE public.volunteer_slots
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(40);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'volunteer_slots_event_id_fkey'
          AND conrelid = 'public.volunteer_slots'::regclass
    ) THEN
        ALTER TABLE public.volunteer_slots
            ADD CONSTRAINT volunteer_slots_event_id_fkey
            FOREIGN KEY (event_id)
            REFERENCES public.events(id)
            ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_volunteer_slots_event
    ON public.volunteer_slots(event_id);

-- ------------------------------------------------------------------------------
-- 2) Backfill slots opened by a build before `event_id` existed. Those rows
--    store the event as a `[event:<id>]` suffix on mass_name.
-- ------------------------------------------------------------------------------
UPDATE public.volunteer_slots
SET event_id = substring(mass_name from '\[event:([^\]]+)\]')::VARCHAR(40),
    mass_name = btrim(regexp_replace(mass_name, '\s*\[event:[^\]]+\]\s*$', ''))
WHERE event_id IS NULL
  AND mass_name ~ '\[event:[^\]]+\]\s*$'
  AND EXISTS (
      SELECT 1
      FROM public.events AS event
      WHERE event.id = substring(volunteer_slots.mass_name from '\[event:([^\]]+)\]')
  );

-- Remove a marker whose event no longer exists, leaving a readable label.
UPDATE public.volunteer_slots
SET mass_name = btrim(regexp_replace(mass_name, '\s*\[event:[^\]]+\]\s*$', ''))
WHERE event_id IS NULL
  AND mass_name ~ '\[event:[^\]]+\]\s*$';

UPDATE public.volunteer_slots
SET mass_name = 'Volunteer slot'
WHERE btrim(mass_name) = '';

-- ------------------------------------------------------------------------------
-- 3) Policies and signup capacity.
--    Administrators already manage every slot through
--    "Admins manage volunteer slots" in schema.sql. The policies below are
--    additive, so a coordinator gains access only to their own ministries.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Coordinators manage ministry volunteer slots" ON public.volunteer_slots;
CREATE POLICY "Coordinators manage ministry volunteer slots" ON public.volunteer_slots
FOR ALL TO authenticated
USING (public.is_organization_leader(organization_id, auth.uid()))
WITH CHECK (public.is_organization_leader(organization_id, auth.uid()));

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

-- Enforce the number of spots in the database too, so two members tapping the
-- last spot at the same time cannot both take it. The slot row is locked while
-- the count is checked.
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

-- ------------------------------------------------------------------------------
-- 4) The event's volunteer list.
--    SECURITY DEFINER so a coordinator can read the name and email of the
--    volunteers on their own ministry's slots without exposing every member
--    profile. The WHERE clause is the authorization check.
-- ------------------------------------------------------------------------------
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

-- Let PostgREST pick up the new column and function without waiting for a
-- schema-cache poll.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ------------------------------------------------------------------------------
-- 5) Verify.
-- ------------------------------------------------------------------------------
-- The column and its foreign key.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'volunteer_slots'
  AND column_name IN ('event_id', 'mass_name')
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.volunteer_slots'::regclass
  AND conname = 'volunteer_slots_event_id_fkey';

-- Coordinator policies should be present next to the administrator one.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('volunteer_slots', 'slot_signups')
  AND policyname ILIKE '%Coordinators%'
ORDER BY tablename, policyname;

-- The roster function.
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'list_slot_volunteers';
