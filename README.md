# jobhub
hub for jobs - cs490 null pointers project

## environment variables

local secrets live in **`frontend/.env`** and **`backend/.env`**. Use **`.env.example`** in each folder as a template.

### frontend

- `REACT_APP_SUPABASE_URL` — Supabase project URL
- `REACT_APP_SUPABASE_ANON_KEY` — Supabase anon (public) key
- `REACT_APP_BACKEND_URL` — backend API base URL (`http://localhost:8000` for local dev, or your deployed API URL for prod/preview)

### backend

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_KEY` — Supabase **service role** key (server-only; never expose to the browser)
- `SUPABASE_ANON_KEY` — Supabase anon key (optional until you need it in API code)

### usage

1. Copy **`frontend/.env.example`** → **`frontend/.env`** and **`backend/.env.example`** → **`backend/.env`**, then fill in your keys.
2. **Backend:** `cd backend && source venv/bin/activate && uvicorn main:app --reload`
3. **Frontend:** `cd frontend && npm start` (React loads variables from **`frontend/.env`**)

## get started:

open two terminals, one for the frontend and one for the backend

note: all of the instructions below are for mac users

### 1. start frontend
from project root:

```bash
cd frontend
npm install
npm start
```

this will start react app (usually at `http://localhost:3000`)

### 2) start backend
from the project root:

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

this will start the api server (usually at `http://localhost:8000`)

## database setup

Run the migration in the **Supabase SQL editor** for your project (one-time setup):

```bash
# paste the contents of backend/migrations/001_create_jobs.sql into the Supabase SQL editor
```

The migration creates the `jobs` table with row-level security enabled so each user can only access their own records.

## backend api

All job routes require an `Authorization: Bearer <supabase_access_token>` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/jobs` | List all jobs for the authenticated user |
| `POST` | `/jobs` | Create a new job |
| `GET` | `/jobs/{id}` | Get a single job by ID |
| `PUT` | `/jobs/{id}` | Partially update a job |
| `DELETE` | `/jobs/{id}` | Delete a job |

**Job fields:** `title` (required), `company` (required), `location`, `status` (default: `applied`), `applied_date`, `description`, `notes`

## running tests

### frontend

```bash
cd frontend
npm install
npm test
```

### backend

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx
pytest
```

Backend tests mock the Supabase client — no live database or credentials are needed to run them.

### Linting Checks
```frontend:
local checking for prettier formatting: npx prettier --check . --no-error-on-unmatched-pattern
local fixing for prettier formatting: npx prettier --check . --no-error-on-unmatched-pattern --write

local checking for linting: 
npx eslint . --ext .ts,.tsx, .jsx --no-error-on-unmatched-pattern