# jobhub
hub for jobs - cs490 null pointers project

## deployment (Vercel)

The app runs on **two Vercel projects** (frontend and backend), both connected to this Git repository. Pushes trigger automatic deployments; **`main`** updates production, and **other branches** get preview deployments (each preview has its own URL in the Vercel dashboard).

| Environment | Frontend | Backend API base |
|---------------|----------|------------------|
| Production | [jobhub-eight-weld.vercel.app](https://jobhub-eight-weld.vercel.app) | [jobhubbackend-tan.vercel.app](https://jobhubbackend-tan.vercel.app) |

**Vercel environment variables:** configure secrets in each Vercel project (not in git). The frontend build must include the same Supabase and backend settings as local dev: see **Frontend** below. The backend project needs the Supabase server variables from **Backend** below. For production, set `REACT_APP_BACKEND_URL` on the frontend project to the production backend URL above (no trailing slash). For preview deployments, either use the production API or set `REACT_APP_BACKEND_URL` per preview in Vercel if you need branch-specific APIs.

GitHub Actions (`.github/workflows/ci.yml`) runs tests and builds on pushes and pull requests to `main`; deployment is handled by Vercel’s Git integration.

## performance & accessibility

This pass documents concrete frontend changes for observability, perceived performance, and assistive technology support.

- **Core Web Vitals (dev):** `frontend/src/index.js` passes a callback to `reportWebVitals` only when `NODE_ENV === 'development'`, so CLS/FCP/LCP/TTFB/FID are logged to the console for local profiling. Production builds omit the callback to avoid noise.
- **Dashboard rendering:** client-side job filtering, pagination button numbers, and stat card configs are **memoized** (`useMemo`) so unrelated state updates do not re-scan the full job list or rebuild static card metadata.
- **App shell:** reminder-derived lists (`pending`, due today) are memoized from `reminders`. The primary content wrapper is `<main id="main-content">` for skip-link targets. The “due today” banner uses `role="status"` and `aria-live="polite"`.
- **Global UX:** `public/index.html` sets the document title and description to JobHub-specific copy. A **skip link** (off-screen until focused) jumps to `#main-content`. Global **`:focus-visible`** styles improve keyboard focus visibility. The skip target exists on **every route**: authenticated layout uses `<main id="main-content">` in `AppShell`; auth pages (`Login`, `Signup`, `ForgotPassword`, `ResetPassword`) wrap the card in the same id; the auth-loading gate in `App.jsx` exposes `<main id="main-content">` while the session is resolving.
- **Semantics & tables:** authenticated pages expose a single **`h1`** via the top bar title. Stat cards use `role="region"` with an `aria-label` summarizing the metric; decorative chart bars stay `aria-hidden`. Jobs and document tables include a **visually hidden `<caption>`** for screen reader context; company logo initials in the jobs grid are `aria-hidden` (company name remains in the row).
- **Loading & errors:** full-screen auth loading, protected-route loading, dashboard job load, profile bootstrap and **section** loads (experience / education / skills), **job history** modal load, and document list loading use **`role="status"`** / **`aria-busy`** where appropriate; inline error lines use **`role="alert"`** so failures are announced. Auth “missing Supabase env” messages use **`role="alert"`**.

## environment variables

local secrets live in **`frontend/.env`** and **`backend/.env`**. Use **`.env.example`** in each folder as a template.

### frontend

- `REACT_APP_SUPABASE_URL` — Supabase project URL
- `REACT_APP_SUPABASE_ANON_KEY` — Supabase anon (public) key
- `REACT_APP_BACKEND_URL` — backend API base URL (`http://localhost:8000` for local dev; production: `https://jobhubbackend-tan.vercel.app`; preview builds use whatever you configure in Vercel for that deployment)

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
pytest -v
```

Backend tests mock the Supabase client — no live database or credentials are needed to run them.

### Linting Checks

From `frontend/`:

```bash
# Prettier — verify formatting
npx prettier --check . --no-error-on-unmatched-pattern

# Prettier — apply formatting
npx prettier --write . --no-error-on-unmatched-pattern

# ESLint (same extensions as npm run lint)
npx eslint . --ext .ts,.tsx,.js,.jsx --no-error-on-unmatched-pattern
```
