import calendar
import os
from datetime import date, datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Response
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
PROFILE_REQUIRED_FIELDS = (
    "full_name",
    "headline",
    "location",
    "phone",
    "website",
    "linkedin_url",
)


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


def _normalize_profile_value(value: Optional[str]) -> str:
    return value.strip() if isinstance(value, str) else ""


def get_profile_completion(profile: dict) -> dict:
    completed_fields = [
        field for field in PROFILE_REQUIRED_FIELDS if _normalize_profile_value(profile.get(field))
    ]
    missing_fields = [field for field in PROFILE_REQUIRED_FIELDS if field not in completed_fields]
    total_fields = len(PROFILE_REQUIRED_FIELDS)
    completion_percentage = (
        round((len(completed_fields) / total_fields) * 100) if total_fields else 0
    )

    return {
        "required_fields": list(PROFILE_REQUIRED_FIELDS),
        "completed_fields": completed_fields,
        "missing_fields": missing_fields,
        "completed_count": len(completed_fields),
        "required_count": total_fields,
        "completion_percentage": completion_percentage,
        "is_complete": len(missing_fields) == 0,
    }


# --- Pydantic models ---


class JobCreate(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    status: Optional[str] = "applied"
    applied_date: Optional[date] = None
    deadline: Optional[date] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    recruiter_notes: Optional[str] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None
    applied_date: Optional[date] = None
    deadline: Optional[date] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    recruiter_notes: Optional[str] = None


class ProfileUpsert(BaseModel):
    full_name: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    summary: Optional[str] = None


# Job list search: text fields plus expanded tokens for applied_date / deadline
# (month names, year, day, ISO, locale-style strings) so queries like "april" match.
_JOB_SEARCH_TEXT_FIELDS = (
    "title",
    "company",
    "location",
    "description",
    "notes",
    "recruiter_notes",
    "status",
)


def _parse_job_date_value(value) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    if not s:
        return None
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _date_search_fragments(d: date) -> list[str]:
    parts = [
        d.isoformat(),
        str(d.year),
        f"{d.month:02d}",
        f"{d.day:02d}",
        str(d.day),
    ]
    full = calendar.month_name[d.month].lower()
    abbr = calendar.month_abbr[d.month].lower()
    if full:
        parts.append(full)
    if abbr:
        parts.append(abbr)
    parts.append(d.strftime("%b %d, %Y").lower())
    parts.append(d.strftime("%B %d, %Y").lower())
    return parts


def _job_search_fragments(job: dict) -> list[str]:
    frags: list[str] = []
    for field in _JOB_SEARCH_TEXT_FIELDS:
        v = job.get(field)
        if v is None:
            continue
        frags.append(str(v).lower())
    for field in ("applied_date", "deadline"):
        parsed = _parse_job_date_value(job.get(field))
        if parsed is not None:
            frags.extend(_date_search_fragments(parsed))
    return frags


def _job_matches_query(job: dict, normalized_query: str) -> bool:
    return any(normalized_query in fragment for fragment in _job_search_fragments(job))


# --- Routes ---


@app.get("/")
def root():
    return {"message": "FastAPI running on Vercel"}


@app.get("/jobs")
def list_jobs(
    authorization: Optional[str] = Header(default=None),
    q: Optional[str] = Query(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("jobs").select("*").eq("user_id", user_id).order("created_at", desc=True)
    response = response.execute()
    jobs = response.data
    if not q:
        return jobs

    normalized_query = q.strip().lower()
    if not normalized_query:
        return jobs

    return [job for job in jobs if _job_matches_query(job, normalized_query)]


@app.post("/jobs", status_code=201)
def create_job(job: JobCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = job.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    if "applied_date" in payload and payload["applied_date"] is not None:
        payload["applied_date"] = str(payload["applied_date"])
    if "deadline" in payload and payload["deadline"] is not None:
        payload["deadline"] = str(payload["deadline"])
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
    if "deadline" in payload and payload["deadline"] is not None:
        payload["deadline"] = str(payload["deadline"])
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
    profile = response.data[0] if response.data else {}
    return {"profile": profile, "completion": get_profile_completion(profile)}


@app.put("/profile")
def upsert_profile(profile: ProfileUpsert, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = profile.model_dump(exclude_unset=True)
    payload["user_id"] = user_id
    response = sb.table("profiles").upsert(payload, on_conflict="user_id").execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save profile")
    saved_profile = response.data[0]
    return {"profile": saved_profile, "completion": get_profile_completion(saved_profile)}
