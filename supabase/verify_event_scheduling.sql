-- E-Skedyul event scheduling verification
-- Run this in Supabase Dashboard -> SQL Editor after applying schema.sql.
-- Every query returns the objects or rows that should exist for event scheduling.

-- Core tables and required columns.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'events',
    'member_recurring_availability',
    'member_availability_overrides',
    'volunteer_slots',
    'slot_signups'
  )
ORDER BY table_name;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'events' AND column_name IN (
      'id', 'organization_id', 'title', 'starts_at', 'ends_at',
      'capacity', 'registration_deadline', 'visibility', 'recurrence',
      'repeat_until', 'status'
    ))
    OR (table_name = 'member_recurring_availability' AND column_name IN (
      'id', 'user_id', 'days', 'start_time', 'end_time'
    ))
    OR (table_name = 'member_availability_overrides' AND column_name IN (
      'id', 'user_id', 'override_date', 'override_type', 'start_time', 'end_time'
    ))
    OR (table_name = 'volunteer_slots' AND column_name IN (
      'id', 'organization_id', 'event_id', 'slot_date', 'slot_time', 'mass_name', 'total_spots'
    ))
    OR (table_name = 'slot_signups' AND column_name IN ('slot_id', 'user_id'))
  )
ORDER BY table_name, ordinal_position;

-- Constraints that protect valid schedules and prevent duplicate signups.
SELECT
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name IN (
    'events',
    'member_recurring_availability',
    'member_availability_overrides',
    'slot_signups'
  )
ORDER BY table_name, constraint_name;

-- RLS must be enabled on member-owned scheduling data.
SELECT
  relname AS table_name,
  relrowsecurity AS row_level_security_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'events',
    'member_recurring_availability',
    'member_availability_overrides',
    'volunteer_slots',
    'slot_signups'
  )
ORDER BY relname;

SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'events',
    'member_recurring_availability',
    'member_availability_overrides',
    'volunteer_slots',
    'slot_signups'
  )
ORDER BY tablename, policyname;

-- Useful indexes for schedule reads and signup counts.
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND (
    tablename IN (
      'events',
      'member_recurring_availability',
      'member_availability_overrides',
      'volunteer_slots',
      'slot_signups'
    )
    OR indexname IN (
      'idx_events_starts_at',
      'idx_volunteer_slots_date',
      'idx_slot_signups_user'
    )
  )
ORDER BY tablename, indexname;
