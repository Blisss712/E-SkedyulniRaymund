# E-Skedyul Serverless Supabase Guide

This application connects directly to Supabase without needing a Python or FastAPI server.

## 1. Quick Setup (2 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open your Supabase project dashboard -> **SQL Editor** -> **New query**.
3. Copy and paste the contents of `supabase/schema.sql` (or `supabase/admin_setup.sql` if updating existing schema) and click **Run**.
   - This creates all tables (`organizations`, `events`, `member_profiles`, `admin_profiles`, `organization_join_requests`).
   - It sets up automatic user registration triggers, username resolution (`get_admin_email`), and Row Level Security (RLS).
4. Get your API credentials from Supabase Dashboard -> **Project Settings** -> **API**:
   - Project URL (`https://xyz.supabase.co`)
   - `anon` `public` key

## 2. Connect the React App

Create a file named `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://tbwabyzdojrvhcdyxrib.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then start your Vite dev server:
```powershell
npm run dev
```

The app will automatically detect the configuration and connect directly to your live database and authentication.

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
