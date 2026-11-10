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
--   * RLS keeps every conversation, participant row, and message visible only to
--     the accounts in that conversation. There is no administrator back door into
--     private chats.
--
-- The script is idempotent and safe to run again. Existing organizations and
-- their current members are backfilled at the end.

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
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_conversations_target CHECK (
        (kind = 'direct' AND organization_id IS NULL AND direct_key IS NOT NULL)
        OR
        (kind = 'organization' AND organization_id IS NOT NULL AND direct_key IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Messages created after this moment count as unread for this account.
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

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

-- Names and avatars shown in a chat header and next to group messages.
CREATE OR REPLACE FUNCTION public.get_conversation_participants(p_conversation_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    masked_email TEXT,
    is_self BOOLEAN
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
        (participant.user_id = auth.uid()) AS is_self
    FROM public.chat_participants AS participant
    LEFT JOIN public.member_profiles AS profile
      ON profile.user_id = participant.user_id
    WHERE participant.conversation_id = p_conversation_id
      AND public.is_chat_participant(p_conversation_id)
    ORDER BY participant.joined_at ASC;
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
BEGIN
    PERFORM public.ensure_organization_chat(NEW.id);
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
    AND public.is_chat_participant(conversation_id)
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
    COUNT(participant.user_id) AS chat_members
FROM public.organizations AS organization
LEFT JOIN public.chat_conversations AS conversation
  ON conversation.organization_id = organization.id
LEFT JOIN public.chat_participants AS participant
  ON participant.conversation_id = conversation.id
GROUP BY organization.id, organization.name, conversation.id
ORDER BY organization.name;

