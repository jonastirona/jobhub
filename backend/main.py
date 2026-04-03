import os
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
_supabase = None


def get_supabase():
    """Lazy init so GET / cold starts
    without loading Supabase's heavy
    dependency tree."""
    global _supabase
    if _supabase is None and SUPABASE_URL and SUPABASE_SERVICE_KEY:
        from supabase import create_client

        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


def get_user_id(authorization: Optional[str]) -> str:
    """Extract and verify user ID from
    Bearer token using Supabase."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    token = authorization.split(" ", 1)[1]
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="Database not configured")
    try:
        response = sb.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return response.user.id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# --- Pydantic models ---


class JobCreate(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    status: Optional[str] = "applied"
    applied_date: Optional[date] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    applied_date: Optional[date] = None
    description: Optional[str] = None
    notes: Optional[str] = None


class ProfileUpsert(BaseModel):
    full_name: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    summary: Optional[str] = None


# --- Routes ---


@app.get("/")
def root():
    return {"message": "FastAPI running on Vercel"}


@app.get("/jobs")
def list_jobs(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("jobs").select("*").eq("user_id", user_id).order("created_at", desc=True)
    response = response.execute()
    return response.data


@app.post("/jobs", status_code=201)
def create_job(job: JobCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = job.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    if "applied_date" in payload and payload["applied_date"] is not None:
        payload["applied_date"] = str(payload["applied_date"])
    response = sb.table("jobs").insert(payload).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create job")
    return response.data[0]


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return response.data[0]


@app.put("/jobs/{job_id}")
def update_job(job_id: str, job: JobUpdate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = job.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "applied_date" in payload and payload["applied_date"] is not None:
        payload["applied_date"] = str(payload["applied_date"])
    response = sb.table("jobs").update(payload).eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return response.data[0]


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("jobs").delete().eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return Response(status_code=204)


# --- Profile routes ---


@app.get("/profile")
def get_profile(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("profiles").select("*").eq("user_id", user_id).execute()
    return response.data[0] if response.data else {}


@app.put("/profile")
def upsert_profile(profile: ProfileUpsert, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = profile.model_dump(exclude_unset=True)
    payload["user_id"] = user_id
    response = sb.table("profiles").upsert(payload, on_conflict="user_id").execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save profile")
    return response.data[0]
