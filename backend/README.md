# E-Skedyul Admin Backend

This folder contains the FastAPI service for the admin module.

## Setup

1. Create a virtual environment and install dependencies:

   ```powershell
   cd backend
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env` and set:

   - `DATABASE_URL`: Supabase PostgreSQL connection string, preferably the pooler URL.
   - `SUPABASE_URL`: Supabase project URL.
   - `SUPABASE_PUBLISHABLE_KEY`: server-side auth client key used to sign in and validate access tokens.
   - `SUPABASE_SECRET_KEY`: server-only key used only by trusted bootstrap/admin operations.
   - `CORS_ORIGINS`: the frontend origin, such as `http://localhost:8443`.

   Never commit `.env` or expose `SUPABASE_SECRET_KEY` to the browser.

3. If this is a new database, run `schema.sql` in the Supabase SQL editor.
   If the E-Skedyul Supabase schema is already installed, do not rerun this
   baseline schema; it already contains the member tables. Then create an administrator:

   ```powershell
   python scripts/create_admin.py
   ```

   To enable in-app messaging (private chats and the automatic organization group
   chats), run [`../supabase/messaging.sql`](../supabase/messaging.sql) once after
   either schema. It is idempotent and creates the chat tables, policies, and
   membership triggers.

   The script creates the Supabase Auth user and corresponding `admin_profiles`
   record. It requires `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_FULL_NAME` in
   `.env`.

## Run

From the repository root:

```powershell
uvicorn admin_backend.app:app --app-dir backend --reload
```

The health endpoint is `GET http://127.0.0.1:8000/admin/health`.

The admin API includes:

- `POST /admin/auth/login`
- `POST /admin/auth/logout`
- `GET /admin/dashboard`
- Organization CRUD and status management under `/admin/organizations`
- Event CRUD, duplication, cancellation, and conflict checks under `/admin/events`
- Member join requests:
  - `GET /member/join-requests/groups/{group_code}` to look up an active group
  - `POST /member/join-requests` for authenticated member submissions
  - `GET /member/join-requests/{request_id}` for the member's request status
  - `GET /admin/join-requests` for the admin queue
  - `PATCH /admin/join-requests/{request_id}` to approve or reject
- Authenticated member data under `/member`:
  - Profile, recurring and one-time availability
  - Volunteer slot listings and signup/cancellation
  - Personal assignments
  - Notification listing, creation, read state, and dismissal

Member endpoints accept the same Supabase Auth bearer token as admin endpoints
and only return or modify data belonging to the authenticated member. Set
`VITE_MEMBER_API_URL` (or reuse `VITE_ADMIN_API_URL`) to route the frontend's
member data requests through this API. Without that setting, the frontend keeps
its existing direct-Supabase behavior when Supabase is configured and its local
demo behavior otherwise.

The member tables are defined here and in `../supabase/schema.sql`. Member
identity still comes from Supabase Auth; the FastAPI service validates the
bearer token and checks the member profile in the database.
When an administrator approves a join request, the backend creates the matching
`organization_member_accounts` row in the same database transaction.

Run the backend tests from this directory with:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Protected endpoints require `Authorization: Bearer <Supabase access token>`.

## Response-time target

Login and logout are synchronous, lightweight API operations. The backend uses
connection pooling and disables Supabase client session persistence for request
clients. Actual response time depends on Supabase region, network, and database
pooler configuration; measure it from the deployed frontend before treating
1.5 seconds as a guarantee.
