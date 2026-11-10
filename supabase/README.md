# E-Skedyul Serverless Supabase Guide

This application connects directly to Supabase without needing a Python or FastAPI server.

## 1. Quick Setup (2 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open your Supabase project dashboard -> **SQL Editor** -> **New query**.
3. Copy and paste the contents of `supabase/schema.sql` (or `supabase/admin_setup.sql` if updating existing schema) and click **Run**.
   - This creates all tables (`organizations`, `events`, `member_profiles`, `admin_profiles`, `organization_join_requests`, `notifications`).
   - It sets up automatic user registration triggers, username resolution (`get_admin_email`), and Row Level Security (RLS).
   - An existing project that already has `member_profiles` without the `onboarded` column also needs `supabase/member_onboarding.sql` (see "Signing in and signing up").
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

## 2.1 Schedule assistant (optional)

The member dashboard includes a schedule assistant that answers questions from the
current availability and open-slot data. The browser never receives an LLM API key:
the optional Supabase Edge Function formats a deterministic answer using a
server-side key, while the app falls back to the same deterministic answer if the
function is not deployed or configured.

From the repository root, deploy the function with the Supabase CLI:

```powershell
supabase functions deploy schedule-assistant
supabase secrets set GEMINI_API_KEY=your-server-side-key GEMINI_MODEL=gemini-2.5-flash
```

The function uses Google's Gemini `gemini-2.5-flash` model to format the
deterministic answer. `GEMINI_API_KEY` must only be stored as a Supabase secret.
Never add it to a `VITE_*` variable, log it, or commit it to the repository.

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
| `organization_join_requests` | pending/approved/rejected requests | Admin › Join requests, the member's pending-approval screen |
| `organization_member_accounts` | approved memberships | the member's "My Ministries" list |

No extra SQL is needed beyond installing `schema.sql`. The join code is generated by the
database (`ESK-…`) and is shown on the organization's detail page so it can be shared
with members. The round trip is:

1. An administrator creates an organization and shares its join code.
2. A member enters the code (or pastes a join link) and a `pending` request is written.
3. The administrator approves it in **Join requests**, which records the decision and
   inserts the membership row.
4. The membership appears in the member's **My Ministries** list on their next visit.

### Verify the setup

Paste [`supabase/verify_organizations.sql`](verify_organizations.sql) into a new SQL
Editor query and run it. It is read-only and reports the tables, columns (including the
`join_code` / request-id defaults the app relies on), RLS policies, helper functions, and
the current list of organizations with their join codes. The `events` columns, policies,
and constraints are covered by `verify_event_scheduling.sql`.

### Existing projects: restrict approval to administrators

`approve_join_request()` is `SECURITY DEFINER` and, like every PostgreSQL function, was
created with `EXECUTE` granted to `PUBLIC` — including the `anon` role, so anyone holding
the public anon key could approve a request if they knew its id. `schema.sql` now includes
the administrator check and scoped grants; for a project that already has the schema
installed, run [`supabase/harden_join_request_approval.sql`](harden_join_request_approval.sql)
once. The app is unaffected: it calls the function only while an administrator is signed
in, and falls back to its own RLS-checked update plus membership insert if the call is
rejected.

### Requests kept in the browser by older builds

Earlier builds stored join requests in `localStorage` under `e-skedyul.join-requests` and
showed a fixed sample ministry list on the dashboard. Those rows were never visible to an
administrator and have no organization attached, so they are ignored now — they are not
imported into the database.

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

## 4. Signing In as Admin

- Click **Sign in as Admin** on the welcome screen.
- With `VITE_ADMIN_API_URL` set, sign in with either your **admin email** (`admin@example.com`) or your **admin username** (`admin`). The FastAPI backend resolves the username to the email and validates the token.
- Without the admin API but with Supabase configured, the same form authenticates directly against Supabase Auth using the administrator's **email address or admin username** and password, then confirms the `admin_profiles` role. Accounts that are not in `admin_profiles` are rejected; promote them from the SQL editor (see section 3).
- Only when neither Supabase nor the admin API is configured does the offline demo account exist: type **admin** and **admin123**.
- Member **Sign in** also recognizes any account listed in `admin_profiles` and opens the administrator workspace, so promoted accounts can sign in either way.

