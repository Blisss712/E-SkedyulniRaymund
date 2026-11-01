-- E-SKEDYUL: Notifications backend
-- Run this once in the Supabase SQL Editor for an existing project.

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

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(40)
    REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('schedule', 'approval', 'slot', 'event', 'event_reminder'));

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_event_delivery
    ON public.notifications(user_id, event_id, kind)
    WHERE event_id IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

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

-- Supabase projects with pg_cron enabled can run the reminder function every minute.
-- If pg_cron is not enabled, enable it under Database -> Extensions, then run:
-- SELECT cron.schedule(
--   'e-skedyul-event-happening-reminders',
--   '* * * * *',
--   $$SELECT public.create_event_happening_notifications();$$
-- );
