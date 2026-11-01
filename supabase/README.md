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

Create the account through the app or under Supabase Dashboard -> **Authentication** -> **Users** (for example, `admin@example.com`). Then, in Supabase **SQL Editor**, run:
```sql
SELECT public.make_admin('admin@example.com', 'admin');
```

The SQL setup intentionally does not insert directly into Supabase's internal `auth.users` table. The Auth Dashboard or application must create the user first; `make_admin()` then confirms the email and creates or updates the administrator profile.

## 4. Signing In as Admin

- Click **Sign in as Admin** on the welcome screen.
- You can sign in using either your **admin email** (`admin@example.com`) or your **admin username** (`admin`).
- If you are testing locally or without Supabase, click **Fill Demo Admin (admin / admin123)** for instant offline demo access.
