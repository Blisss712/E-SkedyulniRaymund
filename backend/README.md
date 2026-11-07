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
   - `CORS_ORIGINS`: the frontend origin, such as `http://localhost:5173`.

   Never commit `.env` or expose `SUPABASE_SECRET_KEY` to the browser.

3. Run `schema.sql` in the Supabase SQL editor, then create an administrator:

   ```powershell
   python scripts/create_admin.py
   ```

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
  - `POST /join-requests` for member submissions
  - `GET /admin/join-requests` for the admin queue
  - `PATCH /admin/join-requests/{request_id}` to approve or reject

Protected endpoints require `Authorization: Bearer <Supabase access token>`.

## Response-time target

Login and logout are synchronous, lightweight API operations. The backend uses
connection pooling and disables Supabase client session persistence for request
clients. Actual response time depends on Supabase region, network, and database
pooler configuration; measure it from the deployed frontend before treating
1.5 seconds as a guarantee.
