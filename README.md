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
pip install pytest
pytest
```