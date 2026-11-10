# E-Skedyul Serverless Supabase Guide

This application connects directly to Supabase without needing a Python or FastAPI server.

## 1. Quick Setup (2 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open your Supabase project dashboard -> **SQL Editor** -> **New query**.
3. Copy and paste the contents of `supabase/schema.sql` (or `supabase/admin_setup.sql` if updating existing schema) and click **Run**.
   - This creates all tables (`organizations`, `events`, `member_profiles`, `admin_profiles`, `organization_join_requests`, `notifications`).
   - It sets up automatic user registration triggers, username resolution (`get_admin_email`), and Row Level Security (RLS).
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

## 3. Creating an Admin Account

An administrator is any Supabase Auth user that also has a row in `admin_profiles`.

### 3.1 Promote a normal email account from inside the app (recommended)

1. Register or sign in through the app like any member (`Sign in` / `Create Account`).
2. Run `supabase/admin_setup.sql` (or `schema.sql`) once so `admin_settings` and
   `promote_current_user_to_admin()` exist. Then read the activation code:

   ```sql
   SELECT value AS admin_promotion_code
   FROM public.admin_settings
   WHERE key = 'admin_promotion_code';
   ```

3. Open **Sign in as Admin** on the welcome screen, choose **Activate admin access**,
   and submit that account's email, its password, and the activation code. The app
   calls `promote_current_user_to_admin()`, which creates the `admin_profiles` row.
4. Sign in to the workspace with the same email, or with the optional admin username.

The activation code is stored in `public.admin_settings`, which no browser role can
read (`REVOKE ALL ... FROM anon, authenticated`) and which only the `SECURITY
DEFINER` function may consult. Knowing the public anon key is therefore not enough
to become an administrator. Rotate the code at any time:

```sql
UPDATE public.admin_settings
SET value = 'MY-NEW-ADMIN-CODE', updated_at = NOW()
WHERE key = 'admin_promotion_code';
```

### 3.2 Promote from the Supabase SQL editor

Create the account through the app or under Supabase Dashboard -> **Authentication**
-> **Users** (for example, `admin@example.com`). Then, in Supabase **SQL Editor**, run:

```sql
SELECT public.make_admin('admin@example.com', 'admin');
```

`make_admin()` bypasses RLS, so it is executable only by the SQL editor, the service
role, and the backend — never with the public anon key.

The SQL setup intentionally does not insert directly into Supabase's internal
`auth.users` table. The Auth Dashboard or application must create the user first;
`make_admin()` then confirms the email and creates or updates the administrator profile.

## 4. Signing In as Admin

- Click **Sign in as Admin** on the welcome screen.
- With `VITE_ADMIN_API_URL` set, sign in with either your **admin email** (`admin@example.com`) or your **admin username** (`admin`). The FastAPI backend resolves the username to the email and validates the token.
- Without the admin API but with Supabase configured, the same form authenticates directly against Supabase Auth using the administrator's **email address or admin username** and password, then confirms the `admin_profiles` role. Choose **Activate admin access** on that screen to promote a normal email account (see section 3.1).
- Only when neither Supabase nor the admin API is configured does the offline demo account exist: type **admin** and **admin123**.
- Member **Sign in** also recognizes any account listed in `admin_profiles` and opens the administrator workspace, so promoted accounts can sign in either way.

