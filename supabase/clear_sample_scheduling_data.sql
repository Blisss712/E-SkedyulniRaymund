-- Remove only the sample scheduling data created by sample_scheduling_data.sql.
-- Run in Supabase Dashboard -> SQL Editor.
--
-- This does not delete user-created organizations, events, slots, or signups.
-- Sample signups are deleted first so the script remains safe if test data
-- was added to the sample slots.

BEGIN;

DELETE FROM public.slot_signups
WHERE slot_id LIKE 'sample-slot-%';

DELETE FROM public.volunteer_slots
WHERE id LIKE 'sample-slot-%';

DELETE FROM public.events
WHERE id LIKE 'sample-event-%';

DELETE FROM public.organizations
WHERE id LIKE 'sample-org-%';

COMMIT;

-- Quick result check: all four result sets should return zero rows.
SELECT slot_id, user_id
FROM public.slot_signups
WHERE slot_id LIKE 'sample-slot-%';

SELECT id
FROM public.volunteer_slots
WHERE id LIKE 'sample-slot-%';

SELECT id
FROM public.events
WHERE id LIKE 'sample-event-%';

SELECT id
FROM public.organizations
WHERE id LIKE 'sample-org-%';
