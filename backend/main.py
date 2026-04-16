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
JOB_STATUSES = {
    "interested",
    "applied",
    "interviewing",
    "offered",
    "accepted",
    "declined",
    "rejected",
    "withdrawn",
    "archived",
}
JOB_STATUS_ALIAS = {"interview": "interviewing", "offer": "offered"}


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


class ReminderCreate(BaseModel):
    job_id: str
    title: str
    notes: Optional[str] = None
    due_date: str


class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    due_date: Optional[str] = None
    completed_at: Optional[str] = None


class InterviewEventCreate(BaseModel):
    round_type: str
    scheduled_at: datetime
    notes: Optional[str] = None


class InterviewEventUpdate(BaseModel):
    round_type: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    notes: Optional[str] = None


class ExperienceCreate(BaseModel):
    title: str
    company: str
    location: Optional[str] = None
    start_year: int
    end_year: Optional[int] = None
    description: Optional[str] = None


class ExperienceUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    description: Optional[str] = None


class ExperienceReorder(BaseModel):
    ids: list[str]


def _validate_experience_years(start_year: Optional[int], end_year: Optional[int]) -> None:
    if start_year is not None and start_year < 1900:
        raise HTTPException(status_code=422, detail="start_year must be 1900 or later")
    if start_year is not None and end_year is not None and end_year < start_year:
        raise HTTPException(status_code=422, detail="end_year must be >= start_year")


def _normalize_job_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    normalized = _normalize_job_status_alias(status)
    if normalized not in JOB_STATUSES:
        raise HTTPException(status_code=422, detail="status must be a supported job status")
    return normalized


def _normalize_job_status_alias(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    return JOB_STATUS_ALIAS.get(status, status)


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

    searchable_fields = (
        "title",
        "company",
        "location",
        "description",
        "notes",
        "status",
        "applied_date",
    )
    return [
        job
        for job in jobs
        if any(
            job.get(field) is not None and normalized_query in str(job[field]).lower()
            for field in searchable_fields
        )
    ]


@app.post("/jobs", status_code=201)
def create_job(job: JobCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = job.model_dump(exclude_none=True)
    if "status" in payload:
        payload["status"] = _normalize_job_status(payload["status"])
    payload["user_id"] = user_id
    if "applied_date" in payload and payload["applied_date"] is not None:
        payload["applied_date"] = str(payload["applied_date"])
    response = sb.table("jobs").insert(payload).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create job")
    created = response.data[0]
    history_entry = {
        "job_id": created["id"],
        "user_id": user_id,
        "from_status": None,
        "to_status": created["status"],
    }
    if created.get("applied_date"):
        history_entry["changed_at"] = f"{created['applied_date']}T00:00:00+00:00"
    history_response = sb.table("job_status_history").insert(history_entry).execute()
    if not history_response.data:
        sb.table("jobs").delete().eq("id", created["id"]).eq("user_id", user_id).execute()
        raise HTTPException(status_code=500, detail="Failed to create initial job status history")
    return created


@app.get("/jobs/{job_id}")
def get_job(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return response.data[0]


@app.get("/jobs/{job_id}/history")
def get_job_history(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("job_status_history")
        .select("*")
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .order("changed_at", desc=False)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch job history")
    return response.data or []


@app.get("/jobs/{job_id}/interviews")
def list_interview_events(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("interview_events")
        .select("*")
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .order("scheduled_at", desc=False)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch interview events")
    return response.data or []


@app.post("/jobs/{job_id}/interviews", status_code=201)
def create_interview_event(
    job_id: str, event: InterviewEventCreate, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    job_exists = sb.table("jobs").select("id").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_exists.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if not event.round_type.strip():
        raise HTTPException(status_code=422, detail="round_type must not be blank")
    payload = event.model_dump(exclude_none=True)
    payload["job_id"] = job_id
    payload["user_id"] = user_id
    payload["round_type"] = event.round_type.strip()
    payload["scheduled_at"] = event.scheduled_at.isoformat()
    if "notes" in payload:
        payload["notes"] = event.notes.strip() or None
    response = sb.table("interview_events").insert(payload).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create interview event")
    return response.data[0]


@app.put("/jobs/{job_id}/interviews/{event_id}")
def update_interview_event(
    job_id: str,
    event_id: str,
    event: InterviewEventUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = event.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "round_type" in payload:
        payload["round_type"] = (payload["round_type"] or "").strip()
        if not payload["round_type"]:
            raise HTTPException(status_code=422, detail="round_type must not be blank")
    if "scheduled_at" in payload:
        if payload["scheduled_at"] is None:
            raise HTTPException(status_code=422, detail="scheduled_at must not be null")
        payload["scheduled_at"] = payload["scheduled_at"].isoformat()
    if "notes" in payload:
        payload["notes"] = (payload["notes"] or "").strip() or None
    response = (
        sb.table("interview_events")
        .update(payload)
        .eq("id", event_id)
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Interview event not found")
    return response.data[0]


@app.delete("/jobs/{job_id}/interviews/{event_id}")
def delete_interview_event(
    job_id: str, event_id: str, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("interview_events")
        .delete()
        .eq("id", event_id)
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Interview event not found")
    return Response(status_code=204)


@app.put("/jobs/{job_id}")
def update_job(job_id: str, job: JobUpdate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = job.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "status" in payload:
        payload["status"] = _normalize_job_status(payload["status"])
    if "applied_date" in payload and payload["applied_date"] is not None:
        payload["applied_date"] = str(payload["applied_date"])
    existing = sb.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Job not found")
    old_status = existing.data[0]["status"]
    canonical_old_status = _normalize_job_status_alias(old_status)
    should_insert_status_history = False
    if "status" in payload:
        if payload["status"] == canonical_old_status:
            # Alias-to-canonical transitions should be treated as no-op status updates.
            payload.pop("status")
        else:
            should_insert_status_history = True

    if not payload:
        return existing.data[0]

    response = sb.table("jobs").update(payload).eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    updated = response.data[0]
    if should_insert_status_history:
        sb.table("job_status_history").insert(
            {
                "job_id": job_id,
                "user_id": user_id,
                "from_status": canonical_old_status,
                "to_status": updated["status"],
            }
        ).execute()
    return updated


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


# --- Reminder routes ---


@app.get("/reminders")
def list_reminders(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("reminders")
        .select("*, jobs(title, company)")
        .eq("user_id", user_id)
        .order("due_date", desc=False)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch reminders")
    return response.data or []


@app.post("/reminders", status_code=201)
def create_reminder(reminder: ReminderCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    job_check = (
        sb.table("jobs").select("id").eq("id", reminder.job_id).eq("user_id", user_id).execute()
    )
    if not job_check.data:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = reminder.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    response = sb.table("reminders").insert(payload).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create reminder")
    return response.data[0]


@app.put("/reminders/{reminder_id}")
def update_reminder(
    reminder_id: str,
    reminder: ReminderUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = reminder.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    response = (
        sb.table("reminders").update(payload).eq("id", reminder_id).eq("user_id", user_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return response.data[0]


@app.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("reminders").delete().eq("id", reminder_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return Response(status_code=204)


# --- Experience routes ---


@app.get("/experience")
def list_experience(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("experience").select("*").eq("user_id", user_id).order("position").execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch experience")
    return response.data


@app.post("/experience", status_code=201)
def create_experience(entry: ExperienceCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    _validate_experience_years(entry.start_year, entry.end_year)
    if not entry.title.strip():
        raise HTTPException(status_code=422, detail="title must not be blank")
    if not entry.company.strip():
        raise HTTPException(status_code=422, detail="company must not be blank")
    payload = entry.model_dump(exclude_none=True)
    payload["title"] = entry.title.strip()
    payload["company"] = entry.company.strip()
    if "location" in payload:
        payload["location"] = entry.location.strip() or None
    if "description" in payload:
        payload["description"] = entry.description.strip() or None
    payload["user_id"] = user_id
    # Retry once on insert failure to handle the narrow race window where two
    # concurrent creates read the same max position and collide on the UNIQUE
    # (user_id, position) constraint.  A per-user DB sequence would eliminate
    # the window entirely but requires a Supabase RPC.
    for attempt in range(2):
        position_resp = (
            sb.table("experience")
            .select("position")
            .eq("user_id", user_id)
            .order("position", desc=True)
            .limit(1)
            .execute()
        )
        if position_resp.data is None:
            raise HTTPException(status_code=500, detail="Failed to determine experience position")
        payload["position"] = (position_resp.data[0]["position"] if position_resp.data else -1) + 1
        response = sb.table("experience").insert(payload).execute()
        if response.data:
            return response.data[0]
        if attempt == 0:
            continue  # retry with a fresh position read
    raise HTTPException(status_code=500, detail="Failed to create experience entry")


@app.put("/experience/reorder")
def reorder_experience(
    data: ExperienceReorder, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    existing_resp = sb.table("experience").select("id,position").eq("user_id", user_id).execute()
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to validate experience for reorder")
    existing_ids = [r["id"] for r in existing_resp.data]
    if len(data.ids) != len(set(data.ids)):
        raise HTTPException(status_code=400, detail="Experience ids must be unique")
    if set(data.ids) != set(existing_ids):
        raise HTTPException(
            status_code=400,
            detail=(
                "ids must contain each of the authenticated user's experience entries exactly once"
            ),
        )
    if data.ids:
        # Capture current positions for best-effort recovery if phase 2 fails.
        original_positions = {r["id"]: r["position"] for r in existing_resp.data if "position" in r}
        # Phase 1: shift all positions to temporary out-of-range values to avoid
        # violating the UNIQUE (user_id, position) constraint during swaps.
        temp_updates = [
            {"id": entry_id, "user_id": user_id, "position": len(data.ids) + i}
            for i, entry_id in enumerate(data.ids)
        ]
        temp_resp = sb.table("experience").upsert(temp_updates, on_conflict="id").execute()
        if temp_resp.data is None:
            raise HTTPException(status_code=500, detail="Failed to reorder experience")
        # Phase 2: write the final 0..n-1 positions.
        final_updates = [
            {"id": entry_id, "user_id": user_id, "position": position}
            for position, entry_id in enumerate(data.ids)
        ]
        update_resp = sb.table("experience").upsert(final_updates, on_conflict="id").execute()
        if update_resp.data is None:
            # Best-effort: attempt to restore original positions so rows are not
            # left with out-of-range position values from phase 1.
            if original_positions:
                recovery_updates = [
                    {"id": entry_id, "user_id": user_id, "position": pos}
                    for entry_id, pos in original_positions.items()
                ]
                sb.table("experience").upsert(recovery_updates, on_conflict="id").execute()
            raise HTTPException(status_code=500, detail="Failed to reorder experience")
    response = sb.table("experience").select("*").eq("user_id", user_id).order("position").execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch reordered experience")
    return response.data


@app.put("/experience/{entry_id}")
def update_experience(
    entry_id: str,
    entry: ExperienceUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = entry.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    _EXPERIENCE_REQUIRED_FIELDS = ("title", "company", "start_year")
    for field in _EXPERIENCE_REQUIRED_FIELDS:
        if field in payload and payload[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
    if "title" in payload:
        payload["title"] = (payload["title"] or "").strip()
        if not payload["title"]:
            raise HTTPException(status_code=422, detail="title must not be blank")
    if "company" in payload:
        payload["company"] = (payload["company"] or "").strip()
        if not payload["company"]:
            raise HTTPException(status_code=422, detail="company must not be blank")
    if "location" in payload:
        payload["location"] = (payload["location"] or "").strip() or None
    if "description" in payload:
        payload["description"] = (payload["description"] or "").strip() or None
    existing_resp = (
        sb.table("experience").select("*").eq("id", entry_id).eq("user_id", user_id).execute()
    )
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch experience entry")
    if not existing_resp.data:
        raise HTTPException(status_code=404, detail="Experience entry not found")
    existing = existing_resp.data[0]
    effective_start = payload.get("start_year", existing.get("start_year"))
    effective_end = payload.get("end_year", existing.get("end_year"))
    _validate_experience_years(effective_start, effective_end)
    response = (
        sb.table("experience").update(payload).eq("id", entry_id).eq("user_id", user_id).execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to update experience entry")
    if not response.data:
        raise HTTPException(status_code=404, detail="Experience entry not found")
    return response.data[0]


@app.delete("/experience/{entry_id}")
def delete_experience(entry_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("experience").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to delete experience entry")
    if not response.data:
        raise HTTPException(status_code=404, detail="Experience entry not found")
    return Response(status_code=204)
