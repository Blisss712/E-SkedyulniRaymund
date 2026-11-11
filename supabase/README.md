# E-Skedyul Serverless Supabase Guide

This application connects directly to Supabase without needing a Python or FastAPI server.

## 1. Quick Setup (2 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open your Supabase project dashboard -> **SQL Editor** -> **New query**.
3. Copy and paste the contents of `supabase/schema.sql` into a new query and click **Run**.
   (`supabase/admin_setup.sql` is a smaller repair script for administrator sign-in only; it
   does not install organizations, join requests, or coordinators.)
   - This creates all tables (`organizations`, `events`, `member_profiles`, `admin_profiles`, `organization_join_requests`, `organization_leaders`, `notifications`, `chat_conversations`, `chat_participants`, `chat_messages`).
   - It sets up automatic user registration triggers, username resolution (`get_admin_email`), and Row Level Security (RLS).
   - An existing project that already has `member_profiles` without the `onboarded` column also needs `supabase/member_onboarding.sql` (see "Signing in and signing up").
   - An existing project that wants ministry coordinators also needs `supabase/organization_leaders.sql` and, to let coordinators review join requests, `supabase/coordinator_join_approvals.sql` (see section 2.4).
   - An existing project that wants messaging also needs `supabase/messaging.sql` (see section 2.5).
4. Get your API credentials from Supabase Dashboard -> **Project Settings** -> **API**:
   - Project URL (`https://xyz.supabase.co`)
   - `anon` `public` key

## 2. Connect the React App

Create a file named `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then start your Vite dev server:
```powershell
npm run dev
```

The app will automatically detect the configuration and connect directly to your live database and authentication.

### Signing in and signing up

With the two variables set, the welcome screen offers **Create account** and **Sign in**.
Members can register with email and password, Google, Facebook, or a phone OTP. Returning
members are taken straight to their dashboard, and the session survives a page reload.

Every **new** account goes through the same setup wizard — confirm your name, then enter a
group code — whichever button created it. Social sign-ups used to skip those prompts
because Google/Facebook already supply a name and an email, and the app guessed from the
name (later from a 15-minute "first sign-in" window) that setup was done. The wizard is now
driven by a recorded flag instead, never by the name or by the sign-in timestamps:

1. `member_profiles.onboarded`, the durable record, on projects that ran
   [`supabase/member_onboarding.sql`](member_onboarding.sql).
2. `user_metadata.onboarded`, written when the member confirms their name, so the flag
   still sticks on a project that has not run that script yet.

An account with neither record counts as new: it is asked once, the wizard records the
flag, and the prompt does not come back. Members who registered before this change — email
or social — are therefore asked once more, which is cheaper than leaving a social account
that never saw the wizard marked as finished for good. Running the script is recommended
but optional; it is idempotent, and its backfill (which would mark every existing row as
finished) is deliberately left commented out.

### Social sign-in (Google / Facebook)

Google and Facebook sign-in leave the app and come back through Supabase, so two settings
must agree:

1. **Supabase** → Authentication → URL Configuration → **Redirect URLs** must contain the
   app URL you actually use, e.g. `http://localhost:8443` (plus your deployed URL).
2. **Google** (Authorized redirect URIs) and **Facebook** (Valid OAuth Redirect URIs) must
   contain the Supabase callback:
   `https://<project-ref>.supabase.co/auth/v1/callback`.

The client ID/secret from Google Cloud Console or the Meta developer dashboard is saved
under **Authentication → Providers** in Supabase.

When a provider refuses the request, Supabase sends the browser back with
`?error=access_denied&error_description=...`. The app now opens the sign-in screen with that
reason instead of silently showing the welcome screen again:

| Message in the app | Cause |
| --- | --- |
| "The provider cancelled the sign-in (`access_denied`)" | The account chooser was dismissed or the consent screen was declined. Sign in again and accept the permissions. |
| Facebook `Permissions error` | The Meta app is still in **Development mode**, or the requested `email` permission is not granted to that account. Add the account as a Tester/Administrator (Meta app dashboard → App roles) or switch the app to **Live**. |
| "The provider rejected the callback URL" | The redirect URLs above do not match exactly — check `http` vs `https`, the port, and trailing slashes. |
| "That sign-in link was stale" (`bad_oauth_state`) | The tab was left open too long. Start the sign-in again from the app. |

### Google/Facebook accounts have no password

Supabase creates an OAuth account **without a password**. That is why the email
and password form answers "Invalid login credentials" for an account that was
made with **Continue with Google**, even when the email address is exactly right:
there is nothing on the account to compare the typed password with. This is not a
duplicate account or a missing `member_profiles` row.

The app now handles this in three ways:

- The member sign-in screen and the Leader/Coordinator sign-in screen explain it
  in the error and offer **Set a password for this account**.
- **Forgot password?** emails a link that opens the app on a "Choose a new
  password" screen. The link signs into the **existing** account, so the saved
  password is added to the same user — same ministries, join requests, profile,
  and schedule. Afterwards either Google/Facebook or email + password works.
- The Leader/Coordinator screen offers the same three ways in as the member
  screen: **Continue with Google**, **Continue with Facebook**, and **Continue
  with Phone** (a one-time SMS code), followed by email + password. An appointed
  coordinator who signed up with a provider or a mobile number does not need a
  password at all. The app remembers that the Google/Facebook round trip started
  there and opens the coordinator workspace instead of the member dashboard; the
  phone code is verified on that screen and the session is ended again if the
  number's account is not appointed.

For the emailed link to come back to the app:

1. **Supabase → Authentication → URL Configuration → Redirect URLs** must contain
   the app URL you actually use, e.g. `http://localhost:8443` (plus your deployed
   URL). The app sends `window.location.origin` as the redirect.
2. Keep the **Reset password** email template (or make sure a custom template
   still links to `{{ .ConfirmationURL }}`).
3. Email delivery must work. Supabase's built-in sender is fine for development
   but heavily rate-limited; configure custom SMTP under **Authentication →
   Emails** before relying on it in production.

The same screen is the normal "I forgot my password" flow. It never creates a
second account, and it does not touch the Google/Facebook identity.

### Existing projects: member profile repair

Availability, slot sign-ups, and join requests reference `member_profiles(user_id)`. The
`schema.sql` trigger `handle_new_user()` creates that row on registration. If your project
was installed with `admin_setup.sql` only, or the trigger was dropped, member writes fail
with a foreign-key error even though sign-in works. `schema.sql` now includes the policy
below; run this once on an existing project to let the client repair its own row:

```sql
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Create own member profile" ON public.member_profiles;
CREATE POLICY "Create own member profile" ON public.member_profiles
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
```

Also re-create the trigger if it is missing:

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

Phone (SMS OTP) sign-ups have no email address. Older revisions of `handle_new_user()`
inserted `NULL` into the `member_profiles.full_name` (`NOT NULL`) column, so every phone
sign-up failed with *"Database error saving new user"*. Re-run the `handle_new_user()`
definition and the trigger above (both from `schema.sql`) to pick up the phone fallback.

## 2.1 Notifications

The notification center reads from `public.notifications` for the signed-in user and
subscribes to Supabase Realtime changes. It also writes read and dismissed state back
to Supabase, so notification state stays synchronized across browser and mobile
sessions. The main `schema.sql` includes this setup. For an existing project that
already has the schema installed, run `supabase/notifications.sql` once in the
Supabase SQL Editor.

When an administrator publishes an event, a database trigger creates one
notification for each member and organization administrator assigned to that
organization. The schema also includes
`create_event_happening_notifications()`, which creates one reminder when a
published event is in progress. To run those reminders automatically, enable
the `pg_cron` extension in Supabase under **Database -> Extensions**, then run:

```sql
SELECT cron.schedule(
  'e-skedyul-event-happening-reminders',
  '* * * * *',
  $$SELECT public.create_event_happening_notifications();$$
);
```

The event and reminder rows are deduplicated by user, event, and notification
kind, so the cron job can run every minute without sending duplicates.

The admin event save flow also calls `notify_event_members(event_id)` after a
published event is saved. To backfill notifications for an event that was
already published before this function was installed, run:

```sql
SELECT public.notify_event_members('your-event-id');
```

## 2.1 Ministry assistant

The floating bubble on the member dashboard opens a chat assistant that answers
from the ministries the member joined: their published events, the latest group
messages, open volunteer slots, and saved availability. It uses a free-tier
Gemini 3.x Flash model (`gemini-3.6-flash`, with `gemini-3.5-flash-lite` as a
fallback while a model is busy).

The key is **server-side** in the root `.env`, next to the Supabase values:

```dotenv
GEMINI_API_KEY=your-free-google-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite
```

The browser only calls `POST /api/assistant`; it never receives the key. On
localhost the Vite dev server handles that route, and on Vercel the
`api/assistant.ts` Edge Function handles it. Add the same three names under
**Vercel -> Project Settings -> Environment Variables** before deploying.

`GEMINI_MODEL` is the primary free-tier model and
`GEMINI_FALLBACK_MODELS` is a comma-separated list tried when Gemini returns a
capacity or rate-limit error. Without a key, the assistant still answers from
the member's saved data, and the panel labels the source under each answer.

The FastAPI helper in [`../backend`](../backend/README.md) is another optional
backend. The app tries `/api/assistant` first, then that backend if it is
configured. (The old `schedule-assistant` Supabase Edge Function has been
removed; the app no longer calls `supabase.functions.invoke`.)

## 2.1 Verify event scheduling

After applying the schema, open Supabase Dashboard -> **SQL Editor** -> **New query**, paste `supabase/verify_event_scheduling.sql`, and click **Run**. The script is read-only and reports the event, availability, volunteer-slot, RLS policy, constraint, and index definitions needed by the app. Review each result set to confirm the expected tables, columns, enabled RLS, policies, and indexes are present.

## 2.2 Load sample scheduling data

To populate the timetable and exercise organization/event/slot workflows, paste `supabase/sample_scheduling_data.sql` into a new Supabase SQL Editor query and click **Run**. It creates three sample organizations, published one-time events, weekly and monthly recurring events, a draft, a cancelled event, and volunteer slots using dates relative to the day the script runs. It also adds a fixed, densely scheduled timetable test week from **November 9 through November 15, 2026**, with non-overlapping published blocks across every day and multiple organizations. The Wednesday evening block is intentionally placed before the recurring Wednesday prayer event so the sample data does not overlap itself.

The script is repeatable and only upserts rows whose IDs begin with `sample-`; it does not delete or modify user-created rows. To remove the sample records afterward, run:

```sql
DELETE FROM public.volunteer_slots WHERE id LIKE 'sample-slot-%';
DELETE FROM public.events WHERE id LIKE 'sample-event-%';
DELETE FROM public.organizations WHERE id LIKE 'sample-org-%';
```

You can also paste `supabase/clear_sample_scheduling_data.sql` into the SQL Editor and run it. It removes the sample signups, slots, events, and organizations in foreign-key-safe order, then returns verification queries that should be empty.

The sample rows are read by the frontend through Supabase just like rows created in the admin dashboard. If the app is already open while you run the SQL script, refresh the page or navigate so the relevant data-loading hook runs again. Direct SQL execution does not dispatch the browser's in-app event-change signal; admin dashboard mutations do update the open frontend immediately.

## 2.3 Organizations, memberships, and join requests

The administrator workspace, the member dashboard's **My Ministries** list, and the
join-code lookup all read the same three tables, so an organization can never appear on
one screen and be missing from another:

| Table | Holds | Read by |
| --- | --- | --- |
| `organizations` | the parishes/ministries, their status and `join_code` | Admin › Organizations, Dashboard metrics, the Events organization picker, the join-code lookup |
| `organization_join_requests` | pending/approved/rejected requests | Admin › Join requests, Coordinator › Join requests, the member's pending-approval screen |
| `organization_member_accounts` | approved memberships | the member's "My Ministries" list |

No extra SQL is needed beyond installing `schema.sql`. The join code is generated by the
database (`ESK-…`) and is shown on the organization's detail page so it can be shared
with members. The round trip is:

1. An administrator creates an organization and shares its join code.
2. A member enters the code (or pastes a join link) and a `pending` request is written.
3. An administrator, or the coordinator of that ministry, approves it in **Join requests**, which
   records the decision and inserts the membership row.
4. The membership appears in the member's **My Ministries** list on their next visit.

### Verify the setup

Paste [`supabase/verify_organizations.sql`](verify_organizations.sql) into a new SQL
Editor query and run it. It is read-only and reports the tables, columns (including the
`join_code` / request-id defaults the app relies on), RLS policies, helper functions, and
the current list of organizations with their join codes. The `events` columns, policies,
and constraints are covered by `verify_event_scheduling.sql`.

### Existing projects: enable coordinator approval safely

`approve_join_request()` is `SECURITY DEFINER` and, like every PostgreSQL function, was
created with `EXECUTE` granted to `PUBLIC` — including the `anon` role, so anyone holding
the public anon key could approve a request if they knew its id. The original hardening
script closed that gap but also made approval administrator-only.

Run [`supabase/coordinator_join_approvals.sql`](coordinator_join_approvals.sql) once on an
existing project. It:

- lets a coordinator read the join requests of the ministries they lead, and only those;
- replaces the decision logic with `review_join_request()`, which authorizes an
  administrator or the coordinator of the request's own ministry, and creates the
  membership row in the same transaction when approving;
- keeps `approve_join_request()` as a compatibility wrapper for older app builds;
- changes `organization_join_requests.reviewed_by` to reference `auth.users`, so both an
  administrator and a coordinator can be recorded;
- keeps the `anon` role out of both RPCs.

The app now calls `review_join_request()` for both roles. An administrator on a project that
has not run the script still falls back to the older administrator RPC (or the RLS-checked
direct update); a coordinator sees an explicit “run this script” message rather than a
half-working queue. `harden_join_request_approval.sql` is retained for history but is now a
read-only check — running its old administrator-only definition would undo coordinator
approval.

### Requests kept in the browser by older builds

Earlier builds stored join requests in `localStorage` under `e-skedyul.join-requests` and
showed a fixed sample ministry list on the dashboard. Those rows were never visible to an
administrator and have no organization attached, so they are ignored now — they are not
imported into the database.

## 2.4 Ministry coordinators (leaders)

A **coordinator** is an ordinary member account that an administrator appoints to one
ministry. Coordinators can add and organise that ministry's events and review that
ministry's join requests from a limited **Coordinator Workspace**; they keep their member
dashboard for availability and open slots. They cannot create organizations or appoint
other coordinators — those stay administrator-only.

Appointments live in one table:

| Table | Holds | Read by |
| --- | --- | --- |
| `organization_leaders` | one row per (ministry, member) appointment, with who appointed it and when | the auth context on sign-in, the admin's **Coordinators** screen, and the event/organization/join-request RLS policies |

### Install

`organization_leaders` and the join-request decision function are part of `schema.sql`, so a
fresh project needs no extra step. For an existing project, run these once in the Supabase
SQL Editor, in order:

1. [`supabase/organization_leaders.sql`](organization_leaders.sql) if the table is missing.
   It creates the table, the `is_organization_leader()` helper, the "coordinator must belong
   to the ministry" trigger, and the RLS policies that let a coordinator manage only their
   ministry's events.
2. [`supabase/coordinator_join_approvals.sql`](coordinator_join_approvals.sql) to let a
   coordinator read and decide the join requests of the ministries they lead.

Both scripts are idempotent. Until the second one is run, coordinator lookups still work but
the review queue stays administrator-only, and a coordinator who tries to decide a request
sees an explicit "run this script" message.

### Appoint a coordinator

1. The member must already belong to the ministry (their join request must be approved).
2. Sign in to the **Administrator Workspace** and open **Coordinators**.
3. Search the member accounts by name or email, select the account, choose one of the
   ministries it belongs to, and click **Appoint as coordinator**.
4. The member now sees a **Coordinator Workspace** button on their dashboard after their
   next profile refresh/sign-in. They can also use the separate **Leader / Coordinator
   sign in** with their account email. Their workspace includes **Join requests** for the
   ministries they lead.

**Remove access** on the same screen revokes the appointment; the account keeps working as
a normal member. Removing the member from the ministry also removes the appointment
automatically.

### Review join requests

The coordinator workspace has a **Join requests** section with the same
grouped-by-ministry queue as the administrator workspace: pending counts, search, filters,
one-member decisions, and **Approve all** for a ministry. It lists only the ministries the
coordinator leads.

Decisions go through `review_join_request()`. The function checks the request's own
`organization_id` against `organization_leaders`, so a coordinator of one ministry cannot
decide another ministry's requests even by calling the RPC directly. Approving inserts the
`organization_member_accounts` row in the same transaction, which is what makes the ministry
appear on the member's dashboard; rejecting leaves any existing membership unchanged. The
reviewer is stored in `reviewed_by`, which now references `auth.users` so both an
administrator and a coordinator can be recorded.

### What the policies allow

- `organization_leaders`: administrators insert/delete appointments; a coordinator can read
  their own rows (which is how the app decides which workspace to open).
- `organizations`: a coordinator can read the ministry they lead even when it is inactive.
- `events`: a coordinator can read every event of their ministries (not just published ones)
  and insert, update, or delete events for those ministries. The administrator policies are
  additive, so administrators still manage everything.
- `organization_join_requests`: a coordinator can read the requests of the ministries they
  lead. They have no direct UPDATE policy; decisions are written only by
  `review_join_request()`, which validates the ministry and records the reviewer. The
  administrator "full manage" policy stays in place.
- `review_join_request()` / `approve_join_request()`: executable only by `authenticated` and
  `service_role`, never `anon`.

To verify the installation, run [`supabase/verify_organizations.sql`](verify_organizations.sql);
section 7 lists the current appointments. The appointment screen is also a safe way to check:
if the table is missing it reports that the appointments could not be loaded.

## 2.5 Messaging (direct chats and ministry group chats)

The member dashboard's **Messages** tab — and the same **Messages** section in the
Administrator and Coordinator workspaces — lets every account:

- search the other member accounts by full name or email address and start a private chat;
- read and post in the group chat that every organization gets automatically;
- open the member list, see each person's profile, and see who is an administrator or
  coordinator in the conversation.

Administrators and coordinators additionally control who may post in a ministry group:
they can switch the whole group to announcements only, or mute individual members.

### Install

`chat_conversations`, `chat_participants`, and `chat_messages` are part of `schema.sql`,
so a fresh project needs no extra step. For an existing project, run
[`supabase/messaging.sql`](messaging.sql) once in the Supabase SQL Editor. It is
idempotent and also:

- creates one group chat for every organization that already exists, and adds the
  organization's current approved members and assigned administrators;
- creates the triggers that keep that membership in sync from then on;
- adds the group posting mode and individual mute columns;
- adds the chat tables to the `supabase_realtime` publication;
- installs the account-search, conversation, member-profile, and group-control RPCs.

If an earlier version of `messaging.sql` was already installed, **re-run this updated
script**. It adds the new columns, recreates the participant RPC with the role/profile
fields, and replaces the message INSERT policy with the posting-control check.

If the app shows **"Messaging is not set up in Supabase yet"**, that script has not been
run on the project the app is pointed at.

### The automatic organization group chat

| Event | What happens in the chat |
| --- | --- |
| An organization is created | A group chat titled with the organization name is created, and the administrator who created it is added. |
| The organization is renamed | The group chat is renamed too. |
| A join request is approved | The new approved member is added to the group chat. |
| An administrator is assigned to the organization | They are added to the group chat as well. |
| A member leaves/is removed from the organization | They are removed from the group chat. |
| The organization is deleted | Its group chat and messages are deleted with it. |

The triggers run in the database, so this also works for organizations created by the
admin workspace, by the optional FastAPI backend, or directly in SQL.

### Member list, profiles, and role badges

Inside a group chat, the people button in the header opens **Members**. It lists every
participant (approved members plus assigned administrators) with:

- their name and masked email;
- a **Coordinator**, **Admin**, or **Member** badge;
- whether they can send messages, and a **Mute**/**Allow** action for the managers.

Tapping a member opens their profile: their role, shared ministries, when they joined the
chat, a **Message privately** button, and (for managers) the mute action. Tapping a
message sender's name or avatar opens the same profile.

The role comes from the database, not the browser:

| Role | Determined by |
| --- | --- |
| **Admin** | an active row in `admin_profiles` |
| **Coordinator** | an `organization_leaders` appointment for this group's organization |
| **Member** | every other participant |

Every group message from an administrator or coordinator shows a colored role badge, and
their avatar/bubble has a matching ring. Private chats show the other account's role next
to their name in the header.

### Group controls

Administrators and the ministry's coordinator get a **Group controls** card in the
Members sheet:

| Setting | Behaviour |
| --- | --- |
| **Everyone** | Every approved member can send messages. |
| **Announcements only** | Members can read the group but cannot send; administrators and coordinators can still post. |
| **Mute / Allow** (per member) | Applies to individual regular members while the group is open. Administrators and coordinators always keep posting access. |

These controls are enforced in the database: the `chat_messages` INSERT policy calls
`can_i_post_to_conversation()`. A muted member (or a member in an announcements-only
group) cannot bypass the UI by calling PostgREST directly. Private chats have no group
controls and both participants can always send.

Changes are picked up by the open chat screen through a short polling refresh, so a
member's composer locks when a coordinator mutes them or switches the group to
announcements only.

### Privacy and security

- A private chat is visible only to its two participants. Administrators have no
  read access to other people's private conversations.
- RLS rejects a message written as somebody else, and rejects reads or posts in a
  conversation the account does not belong to.
- Account search and the member profile return masked email addresses only; profiles
  show shared ministries, not a person's full ministry list.
- Group management is restricted to administrators who are participants of the group
  and the coordinator of that specific ministry. A coordinator of another ministry
  cannot change another group.
- The read marker is written only through `mark_conversation_read()`; the app has no
  direct UPDATE privilege on membership rows.

### Repair existing organizations

The installer already runs the backfill, but it can be repeated at any time (for
example after importing organizations through SQL):

```sql
SELECT public.backfill_organization_chats();
```

It is idempotent: organizations that already have a chat keep it and only missing
participants are added.

### Verify

Run the verification queries at the bottom of [`supabase/messaging.sql`](messaging.sql),
or use this read-only summary:

```sql
SELECT
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
GROUP BY organization.name, conversation.id, conversation.posting_mode
ORDER BY organization.name;
```

Every organization should have a non-null `chat_id`. A `posting_mode` of `leaders` means
the group is in announcements-only mode.

### Realtime

`messaging.sql` adds `chat_messages` and `chat_participants` to the
`supabase_realtime` publication when they are not already there. The app still
refreshes the inbox when the tab becomes visible and every 60 seconds, so a project
with Realtime disabled remains usable.

## 3. Creating an Admin Account

An administrator is any Supabase Auth user that also has a row in `admin_profiles`.

Promotion is a **SQL-only** operation. The app deliberately has no "become admin"
button, RPC call, or setup code: the only way to grant administrator access is to
run a query in the Supabase SQL editor (or with the service role). This means the
public anon key can never escalate an account, even if someone reads it from the
browser bundle.

### 3.1 Promote from the Supabase SQL editor

1. Register the account through the app (`Create Account`) or under Supabase
   Dashboard -> **Authentication** -> **Users**, so the user exists in `auth.users`.
2. Open Supabase **SQL Editor** -> New query, paste
   [`supabase/promote_to_admin.sql`](promote_to_admin.sql), edit the
   `(email, username)` list in PART 1 (add as many rows as you need), and run it.
   The short form is:

   ```sql
   SELECT public.make_admin('person@example.com', 'person');
   ```

3. Sign in at **Admin sign in** with that email or the admin username.

The full script also contains a self-contained promotion block for projects where
`make_admin()` is not installed, a verification query, and a demotion query.

`make_admin()` bypasses RLS, so it is executable only by the SQL editor, the service
role, and the backend — never with the public anon key.

The SQL setup intentionally does not insert directly into Supabase's internal
`auth.users` table. The Auth Dashboard or application must create the user first;
`make_admin()` then confirms the email and creates or updates the administrator profile.

### 3.2 Remove administrator access

```sql
DELETE FROM public.admin_profiles
WHERE lower(email) = lower('person@example.com');
```

The account keeps working as a normal member; it just loses the admin workspace.

### 3.3 Upgrading from a build with in-app activation

Earlier builds shipped a browser-callable promotion function
(`promote_current_user_to_admin` + `admin_settings`). The client no longer calls it
and new setups do not create it, but an existing project may still have it. To close
that path permanently, run the cleanup section at the top of
[`supabase/promote_to_admin.sql`](promote_to_admin.sql).

## 4. Signing In

The welcome screen separates the two staff sign-ins: **Admin sign in** and **Leader /
Coordinator sign in**. Each form only lets its own kind of account through, so a
coordinator who opens the admin form (or an administrator who opens the coordinator form)
is signed out again and told which form to use.

### 4.1 Administrator sign in

- Click **Admin sign in** on the welcome screen (also linked from the member sign-in
  screen as **Administrator sign in**).
- With `VITE_ADMIN_API_URL` set, sign in with either your **admin email** (`admin@example.com`) or your **admin username** (`admin`). The FastAPI backend resolves the username to the email and validates the token.
- Without the admin API but with Supabase configured, the same form authenticates directly against Supabase Auth using the administrator's **email address or admin username** and password, then confirms the `admin_profiles` role. Accounts that are not in `admin_profiles` are rejected; promote them from the SQL editor (see section 3).
- Only when neither Supabase nor the admin API is configured does the offline demo account exist: type **admin** and **admin123**.

### 4.2 Leader / Coordinator sign in

- Click **Leader / Coordinator sign in** on the welcome screen (also linked from the member
  sign-in screen).
- Sign in with **Continue with Google** or **Continue with Facebook** when the member account
  was created that way, with **Continue with Phone** and the 6-digit SMS code when the account
  uses a mobile number, or with the **email and password** on the account. An account made with
  Google/Facebook/phone has no password until one is set through **Forgot password?** (see
  "Google/Facebook accounts have no password"). There is no username form and no offline demo
  coordinator account.
- Only appointed coordinators pass. An administrator account is rejected with a pointer to
  the admin form, and an ordinary member is told to ask an administrator for an appointment.
  The phone form never creates an account, and a code verified for a number whose account is
  not appointed signs that account out again.
- A coordinator can still use the normal member **Sign in**: that opens their member
  dashboard, where the **Coordinator Workspace** button is available.

