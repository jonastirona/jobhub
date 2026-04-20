import calendar
import os
import uuid
from datetime import date, datetime
from math import ceil
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

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
DOCUMENTS_BUCKET = os.getenv(
    "SUPABASE_DOCUMENTS_BUCKET", "documents"
)  # on supabase side, storage is named documents
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
PDF_EXTENSION = ".pdf"
PDF_MIME_TYPE = "application/pdf"
SIGNED_URL_EXPIRY_SECONDS = 15 * 60
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024
DEADLINE_STATES = {"upcoming", "due_today", "overdue", "no_deadline"}
JOB_SORT_OPTIONS = {"last_activity", "deadline", "created_at", "company"}


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


class EducationCreate(BaseModel):
    institution: str
    degree: str
    field_of_study: str
    start_year: int
    end_year: Optional[int] = None
    gpa: Optional[float] = Field(default=None, ge=0, le=9.99)
    description: Optional[str] = None


class EducationUpdate(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    gpa: Optional[float] = Field(default=None, ge=0, le=9.99)
    description: Optional[str] = None


def _validate_education_years(start_year: Optional[int], end_year: Optional[int]) -> None:
    if start_year is not None and start_year < 1900:
        raise HTTPException(status_code=422, detail="start_year must be 1900 or later")
    if start_year is not None and end_year is not None and end_year < start_year:
        raise HTTPException(status_code=422, detail="end_year must be >= start_year")


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


class DocumentUpdate(BaseModel):
    name: Optional[str] = None
    doc_type: Optional[str] = None
    job_id: Optional[str] = None


VALID_WORK_MODES = {"remote", "hybrid", "onsite", "any"}


class CareerPreferencesUpsert(BaseModel):
    target_roles: Optional[str] = None
    preferred_locations: Optional[str] = None
    work_mode: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


# Must stay in sync with the CHECK constraint in 010_create_skills.sql.
# Duplicated here intentionally so the API returns a clean 422 before touching the DB.
VALID_PROFICIENCY_LEVELS = {"beginner", "intermediate", "advanced", "expert"}


class SkillCreate(BaseModel):
    name: str
    category: Optional[str] = None
    proficiency: Optional[str] = None


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    proficiency: Optional[str] = None


class SkillReorder(BaseModel):
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


def _assert_linked_job_exists_for_user(sb, user_id: str, job_id: Optional[str]) -> None:
    if not job_id:
        return
    response = sb.table("jobs").select("id").eq("id", job_id).eq("user_id", user_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Linked job not found")


def _assert_allowed_document_extension(filename: Optional[str]) -> str:
    extension = Path(filename or "").suffix.lower().strip()
    if extension != PDF_EXTENSION:
        raise HTTPException(status_code=422, detail="Only PDF files are supported")
    return extension


def _assert_pdf_signature(content: bytes) -> None:
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid PDF")


def _build_storage_document_path(user_id: str, extension: str) -> str:
    return f"{user_id}/{uuid.uuid4().hex}{extension}"


async def _upload_document_to_storage(sb, user_id: str, upload: UploadFile) -> tuple[str, str, int]:
    extension = _assert_allowed_document_extension(upload.filename)
    content = await upload.read()
    size = len(content)
    if size == 0:
        raise HTTPException(status_code=422, detail="Document file is required")
    if size > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds 10MB size limit")
    _assert_pdf_signature(content)

    storage_path = _build_storage_document_path(user_id, extension)
    content_type = PDF_MIME_TYPE
    try:
        sb.storage.from_(DOCUMENTS_BUCKET).upload(
            storage_path,
            content,
            {"content-type": content_type, "upsert": "false"},
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to upload document file")
    return storage_path, content_type, size


def _create_document_signed_url(
    sb, bucket: str, storage_path: str, expires_in_seconds: int = SIGNED_URL_EXPIRY_SECONDS
) -> str:
    try:
        data = sb.storage.from_(bucket).create_signed_url(storage_path, expires_in_seconds)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to generate document view link")

    signed_url = None
    if isinstance(data, dict):
        signed_url = data.get("signedURL") or data.get("signedUrl")
    if not signed_url:
        raise HTTPException(status_code=500, detail="Failed to generate document view link")
    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="Storage URL is not configured")
    return f"{SUPABASE_URL}/storage/v1{signed_url}"


def _delete_document_from_storage(sb, bucket: str, storage_path: Optional[str]) -> None:
    if not storage_path:
        return
    try:
        sb.storage.from_(bucket).remove([storage_path])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to delete document file")


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
        # Unpadded day (e.g. "july 4") to align with en-US toLocaleDateString and user queries;
        # strftime("%d") uses zero-padded days ("04") which "jul 4" would not match.
        parts.append(f"{full} {d.day}, {d.year}")
        parts.append(f"{full} {d.day}")
    if abbr:
        parts.append(abbr)
        parts.append(f"{abbr} {d.day}, {d.year}")
        parts.append(f"{abbr} {d.day}")
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


def _normalize_list_param(values: Optional[list[str]]) -> list[str]:
    """Normalize a FastAPI repeated query-param into a clean list of strings.

    Values are treated as opaque strings (we deliberately do NOT split on
    commas, because values like ``"Boston, MA"`` are legitimate single entries).
    """
    if not values:
        return []
    normalized: list[str] = []
    for raw in values:
        if raw is None:
            continue
        cleaned = str(raw).strip()
        if cleaned:
            normalized.append(cleaned)
    return normalized


def _normalize_location_key(value: Optional[str]) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().casefold()


def _to_title_case_location(value: str) -> str:
    has_lower = any(ch.islower() for ch in value)
    has_upper = any(ch.isupper() for ch in value)
    if has_lower and has_upper:
        return value
    parts = [segment.capitalize() for segment in value.split()]
    return " ".join(parts)


def _build_available_locations(jobs: list[dict]) -> list[str]:
    deduped: dict[str, str] = {}
    for job in jobs:
        raw_location = job.get("location")
        if not isinstance(raw_location, str):
            continue
        cleaned_location = raw_location.strip()
        if not cleaned_location:
            continue
        key = cleaned_location.casefold()
        if key not in deduped:
            deduped[key] = _to_title_case_location(cleaned_location)
    return sorted(deduped.values(), key=lambda location: location.casefold())


def _parse_datetime_value(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_job_created_at(job: dict) -> datetime:
    return _parse_datetime_value(job.get("created_at")) or datetime.min


def _parse_job_deadline(job: dict) -> Optional[date]:
    return _parse_job_date_value(job.get("deadline"))


def _datetime_rank(value: datetime) -> int:
    return value.toordinal() * 86400 + value.hour * 3600 + value.minute * 60 + value.second


def _created_sort_tuple(job: dict) -> tuple:
    created_at = _parse_job_created_at(job)
    return (-_datetime_rank(created_at), str(job.get("id") or ""))


def _job_matches_status_filter(job: dict, normalized_statuses: list[str]) -> bool:
    if not normalized_statuses:
        return True
    job_status = _normalize_job_status_alias((job.get("status") or "").strip().lower())
    return job_status in set(normalized_statuses)


def _job_matches_location_filter(job: dict, normalized_locations: list[str]) -> bool:
    if not normalized_locations:
        return True
    normalized_location_keys = {_normalize_location_key(loc) for loc in normalized_locations}
    normalized_location_keys.discard("")
    if not normalized_location_keys:
        return True
    return _normalize_location_key(job.get("location")) in normalized_location_keys


def _job_matches_deadline_filter(
    job: dict, normalized_deadline_states: list[str], today: date
) -> bool:
    if not normalized_deadline_states:
        return True
    deadline = _parse_job_deadline(job)
    states = set(normalized_deadline_states)
    if deadline is None:
        return "no_deadline" in states
    if "upcoming" in states and deadline > today:
        return True
    if "due_today" in states and deadline == today:
        return True
    if "overdue" in states and deadline < today:
        return True
    return False


def _sort_jobs_for_view(
    jobs: list[dict],
    sort_by: str,
    last_activity_by_job_id: Optional[dict[str, datetime]] = None,
) -> list[dict]:
    last_activity_by_job_id = last_activity_by_job_id or {}
    if sort_by == "company":
        return sorted(
            jobs,
            key=lambda job: (
                str(job.get("company") or "").casefold(),
                *_created_sort_tuple(job),
            ),
        )
    if sort_by == "deadline":
        return sorted(
            jobs,
            key=lambda job: (
                _parse_job_deadline(job) is None,
                -(_parse_job_deadline(job) or date.min).toordinal(),
                *_created_sort_tuple(job),
            ),
        )
    if sort_by == "last_activity":
        return sorted(
            jobs,
            key=lambda job: (
                str(job.get("id") or "") not in last_activity_by_job_id,
                -_datetime_rank(
                    last_activity_by_job_id.get(str(job.get("id") or ""), datetime.min)
                ),
                *_created_sort_tuple(job),
            ),
        )
    # created_at (default)
    return sorted(jobs, key=_created_sort_tuple)


# --- Routes ---


@app.get("/")
def root():
    return {"message": "FastAPI running on Vercel"}


@app.get("/jobs")
def list_jobs(
    authorization: Optional[str] = Header(default=None),
    q: Optional[str] = Query(default=None),
    statuses: Optional[list[str]] = Query(default=None),
    locations: Optional[list[str]] = Query(default=None),
    deadline_states: Optional[list[str]] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    normalized_statuses = [
        _normalize_job_status_alias(status) for status in _normalize_list_param(statuses)
    ]
    normalized_locations = _normalize_list_param(locations)
    normalized_deadline_states = _normalize_list_param(deadline_states)

    if any(status not in JOB_STATUSES for status in normalized_statuses):
        raise HTTPException(status_code=422, detail="statuses contains unsupported values")
    if any(state not in DEADLINE_STATES for state in normalized_deadline_states):
        raise HTTPException(status_code=422, detail="deadline_states contains unsupported values")
    if sort_by not in JOB_SORT_OPTIONS:
        raise HTTPException(status_code=422, detail="sort_by contains unsupported values")

    response = sb.table("jobs").select("*").eq("user_id", user_id).execute()
    all_user_jobs = response.data or []

    normalized_query = (q or "").strip().lower()
    if normalized_query:
        jobs_after_search = [
            job for job in all_user_jobs if _job_matches_query(job, normalized_query)
        ]
    else:
        jobs_after_search = list(all_user_jobs)

    today = date.today()

    # Facet sets: each facet's options come from jobs filtered by every OTHER
    # active filter except its own. That way selecting one option in a facet
    # does not hide the other options in the same facet, while deletions and
    # other filters still prune the facet appropriately.
    jobs_for_location_facet = [
        job
        for job in jobs_after_search
        if _job_matches_status_filter(job, normalized_statuses)
        and _job_matches_deadline_filter(job, normalized_deadline_states, today)
    ]
    jobs_for_status_facet = [
        job
        for job in jobs_after_search
        if _job_matches_location_filter(job, normalized_locations)
        and _job_matches_deadline_filter(job, normalized_deadline_states, today)
    ]

    available_locations = _build_available_locations(jobs_for_location_facet)
    available_statuses = sorted(
        {
            normalized
            for normalized in (
                _normalize_job_status_alias((job.get("status") or "").strip().lower())
                for job in jobs_for_status_facet
            )
            if normalized in JOB_STATUSES
        }
    )

    jobs = [
        job
        for job in jobs_after_search
        if _job_matches_status_filter(job, normalized_statuses)
        and _job_matches_location_filter(job, normalized_locations)
        and _job_matches_deadline_filter(job, normalized_deadline_states, today)
    ]

    last_activity_by_job_id: dict[str, datetime] = {}
    if sort_by == "last_activity" and jobs:
        job_ids = [str(job["id"]) for job in jobs if job.get("id")]
        if job_ids:
            history_response = (
                sb.table("job_status_history")
                .select("job_id,changed_at")
                .eq("user_id", user_id)
                .in_("job_id", job_ids)
                .order("changed_at", desc=True)
                .execute()
            )
            for entry in history_response.data or []:
                job_id = str(entry.get("job_id") or "")
                changed_at = _parse_datetime_value(entry.get("changed_at"))
                if not job_id or changed_at is None:
                    continue
                if job_id not in last_activity_by_job_id:
                    last_activity_by_job_id[job_id] = changed_at

    jobs = _sort_jobs_for_view(jobs, sort_by, last_activity_by_job_id)

    total = len(jobs)
    total_pages = ceil(total / page_size) if total > 0 else 1
    # Clamp the requested page into the valid range so clients that ask for a
    # page that no longer exists (e.g. after deletions or filter changes) get
    # the last real page instead of an empty slice with a ghost page number.
    effective_page = min(page, total_pages)
    start_idx = (effective_page - 1) * page_size
    end_idx = start_idx + page_size
    items = jobs[start_idx:end_idx]

    status_counts = {
        "interviewing": 0,
        "offered": 0,
    }
    for job in jobs:
        status = _normalize_job_status_alias((job.get("status") or "").strip().lower())
        if status == "interviewing":
            status_counts["interviewing"] += 1
        if status in {"offered", "accepted"}:
            status_counts["offered"] += 1

    return {
        "items": items,
        "total": total,
        "page": effective_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "available_statuses": available_statuses,
        "available_locations": available_locations,
        "status_counts": status_counts,
    }


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
    if "deadline" in payload and payload["deadline"] is not None:
        payload["deadline"] = str(payload["deadline"])
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
    job_id: str,
    event: InterviewEventCreate,
    authorization: Optional[str] = Header(default=None),
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
    if "deadline" in payload and payload["deadline"] is not None:
        payload["deadline"] = str(payload["deadline"])
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


# --- Document routes ---


@app.get("/documents")
def list_documents(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("documents")
        .select("*, jobs(title, company)")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch documents")
    return response.data or []


@app.post("/documents", status_code=201)
async def create_document(
    name: str = Form(...),
    doc_type: str = Form("Draft"),
    job_id: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    trimmed_name = (name or "").strip()
    if not trimmed_name:
        raise HTTPException(status_code=422, detail="name must not be blank")
    trimmed_doc_type = (doc_type or "").strip() or "Draft"
    _assert_linked_job_exists_for_user(sb, user_id, job_id)
    storage_path, mime_type, file_size = await _upload_document_to_storage(sb, user_id, file)
    payload = {
        "user_id": user_id,
        "job_id": job_id,
        "name": trimmed_name,
        "doc_type": trimmed_doc_type,
        "storage_bucket": DOCUMENTS_BUCKET,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "file_size": file_size,
        "original_filename": file.filename,
    }
    response = sb.table("documents").insert(payload).execute()
    if not response.data:
        _delete_document_from_storage(sb, DOCUMENTS_BUCKET, storage_path)
        raise HTTPException(status_code=500, detail="Failed to create document")
    return response.data[0]


@app.get("/documents/{document_id}")
def get_document(document_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("documents")
        .select("*, jobs(title, company)")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return response.data[0]


@app.get("/documents/{document_id}/view-url")
def get_document_view_url(document_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("documents")
        .select("id, storage_bucket, storage_path")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
    document = response.data[0]
    storage_path = document.get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Document file not found")
    bucket = document.get("storage_bucket") or DOCUMENTS_BUCKET
    return {"url": _create_document_signed_url(sb, bucket, storage_path)}


@app.put("/documents/{document_id}")
def update_document(
    document_id: str,
    document: DocumentUpdate,
    authorization: Optional[str] = Header(default=None),
):
    get_user_id(authorization)
    raise HTTPException(
        status_code=405,
        detail="Updating documents is not supported. Upload a new file or delete this one.",
    )


@app.delete("/documents/{document_id}")
def delete_document(document_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    existing = (
        sb.table("documents")
        .select("id, storage_bucket, storage_path")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = existing.data[0]
    _delete_document_from_storage(
        sb,
        doc.get("storage_bucket") or DOCUMENTS_BUCKET,
        doc.get("storage_path"),
    )

    try:
        response = (
            sb.table("documents").delete().eq("id", document_id).eq("user_id", user_id).execute()
        )
    except APIError:
        raise HTTPException(status_code=500, detail="Failed to delete document")
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
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
    return {
        "profile": saved_profile,
        "completion": get_profile_completion(saved_profile),
    }


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


# --- Career preferences routes ---


@app.get("/career-preferences")
def get_career_preferences(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("career_preferences").select("*").eq("user_id", user_id).execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch career preferences")
    return response.data[0] if response.data else {}


@app.put("/career-preferences")
def upsert_career_preferences(
    prefs: CareerPreferencesUpsert, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = prefs.model_dump(exclude_unset=True)
    if (
        "work_mode" in payload
        and payload["work_mode"] is not None
        and payload["work_mode"] not in VALID_WORK_MODES
    ):
        raise HTTPException(
            status_code=422,
            detail=f"work_mode must be one of: {', '.join(sorted(VALID_WORK_MODES))}",
        )
    if "salary_min" in payload and payload["salary_min"] is not None and payload["salary_min"] < 0:
        raise HTTPException(status_code=422, detail="salary_min must be non-negative")
    if "salary_max" in payload and payload["salary_max"] is not None and payload["salary_max"] < 0:
        raise HTTPException(status_code=422, detail="salary_max must be non-negative")
    if "salary_min" in payload or "salary_max" in payload:
        existing_salary: dict = {}
        if "salary_min" not in payload or "salary_max" not in payload:
            existing_resp = (
                sb.table("career_preferences")
                .select("salary_min,salary_max")
                .eq("user_id", user_id)
                .execute()
            )
            if existing_resp.data is None:
                raise HTTPException(
                    status_code=500, detail="Failed to load existing career preferences"
                )
            existing_salary = existing_resp.data[0] if existing_resp.data else {}
        effective_min = (
            payload["salary_min"] if "salary_min" in payload else existing_salary.get("salary_min")
        )
        effective_max = (
            payload["salary_max"] if "salary_max" in payload else existing_salary.get("salary_max")
        )
        if (
            effective_min is not None
            and effective_max is not None
            and effective_min > effective_max
        ):
            raise HTTPException(status_code=422, detail="salary_min must not exceed salary_max")
    payload["user_id"] = user_id
    response = sb.table("career_preferences").upsert(payload, on_conflict="user_id").execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save career preferences")
    return response.data[0]


# --- Skills routes ---


@app.get("/skills")
def list_skills(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("skills").select("*").eq("user_id", user_id).order("position").execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch skills")
    return response.data


@app.post("/skills", status_code=201)
def create_skill(skill: SkillCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    if not skill.name.strip():
        raise HTTPException(status_code=422, detail="name must not be blank")
    if skill.proficiency is not None and skill.proficiency not in VALID_PROFICIENCY_LEVELS:
        raise HTTPException(
            status_code=422,
            detail=f"proficiency must be one of: {', '.join(sorted(VALID_PROFICIENCY_LEVELS))}",
        )
    payload = skill.model_dump(exclude_none=True)
    payload["name"] = skill.name.strip()
    if "category" in payload:
        payload["category"] = skill.category.strip() or None
    payload["user_id"] = user_id
    # Retry once on insert failure to handle the narrow race window where two
    # concurrent creates read the same max position and collide on the UNIQUE
    # (user_id, position) constraint.  A per-user DB sequence would eliminate
    # the window entirely but requires a Supabase RPC.
    for attempt in range(2):
        position_resp = (
            sb.table("skills")
            .select("position")
            .eq("user_id", user_id)
            .order("position", desc=True)
            .limit(1)
            .execute()
        )
        if position_resp.data is None:
            raise HTTPException(status_code=500, detail="Failed to determine skill position")
        payload["position"] = (position_resp.data[0]["position"] if position_resp.data else -1) + 1
        response = sb.table("skills").insert(payload).execute()
        if response.data:
            return response.data[0]
        if attempt == 0:
            continue  # retry with a fresh position read
    raise HTTPException(status_code=500, detail="Failed to create skill")


# NOTE: /skills/reorder must be defined before /skills/{skill_id} so the
# literal path segment "reorder" is not captured as a skill ID.
@app.put("/skills/reorder")
def reorder_skills(data: SkillReorder, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    existing_resp = sb.table("skills").select("id,position").eq("user_id", user_id).execute()
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to validate skills for reorder")
    existing_ids = [r["id"] for r in existing_resp.data]
    if len(data.ids) != len(set(data.ids)):
        raise HTTPException(status_code=400, detail="Skill ids must be unique")
    if set(data.ids) != set(existing_ids):
        raise HTTPException(
            status_code=400,
            detail="ids must contain each of the authenticated user's skills exactly once",
        )
    if data.ids:
        # Capture current positions for best-effort recovery if phase 2 fails.
        original_positions = {r["id"]: r["position"] for r in existing_resp.data if "position" in r}
        # Phase 1: shift all positions to temporary out-of-range values to avoid
        # violating the UNIQUE (user_id, position) constraint during swaps.
        temp_updates = [
            {"id": skill_id, "user_id": user_id, "position": len(data.ids) + i}
            for i, skill_id in enumerate(data.ids)
        ]
        temp_resp = sb.table("skills").upsert(temp_updates, on_conflict="id").execute()
        if temp_resp.data is None:
            raise HTTPException(status_code=500, detail="Failed to reorder skills")
        # Phase 2: write the final 0..n-1 positions.
        final_updates = [
            {"id": skill_id, "user_id": user_id, "position": position}
            for position, skill_id in enumerate(data.ids)
        ]
        update_resp = sb.table("skills").upsert(final_updates, on_conflict="id").execute()
        if update_resp.data is None:
            # Best-effort: attempt to restore original positions so rows are not
            # left with out-of-range position values from phase 1.
            if original_positions:
                recovery_updates = [
                    {"id": skill_id, "user_id": user_id, "position": pos}
                    for skill_id, pos in original_positions.items()
                ]
                sb.table("skills").upsert(recovery_updates, on_conflict="id").execute()
            raise HTTPException(status_code=500, detail="Failed to reorder skills")
    response = sb.table("skills").select("*").eq("user_id", user_id).order("position").execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch reordered skills")
    return response.data


@app.put("/skills/{skill_id}")
def update_skill(
    skill_id: str, skill: SkillUpdate, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = skill.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "name" in payload:
        payload["name"] = (payload["name"] or "").strip()
        if not payload["name"]:
            raise HTTPException(status_code=422, detail="name must not be blank")
    if "category" in payload:
        payload["category"] = (payload["category"] or "").strip() or None
    if (
        "proficiency" in payload
        and payload["proficiency"] is not None
        and payload["proficiency"] not in VALID_PROFICIENCY_LEVELS
    ):
        raise HTTPException(
            status_code=422,
            detail=f"proficiency must be one of: {', '.join(sorted(VALID_PROFICIENCY_LEVELS))}",
        )
    response = (
        sb.table("skills").update(payload).eq("id", skill_id).eq("user_id", user_id).execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to update skill")
    if not response.data:
        raise HTTPException(status_code=404, detail="Skill not found")
    return response.data[0]


@app.delete("/skills/{skill_id}")
def delete_skill(skill_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("skills").delete().eq("id", skill_id).eq("user_id", user_id).execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to delete skill")
    if not response.data:
        raise HTTPException(status_code=404, detail="Skill not found")
    return Response(status_code=204)


# --- Education routes ---


@app.get("/education")
def list_education(authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = (
        sb.table("education")
        .select("*")
        .eq("user_id", user_id)
        .order("start_year", desc=True)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch education")
    return response.data


@app.post("/education", status_code=201)
def create_education(entry: EducationCreate, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    _validate_education_years(entry.start_year, entry.end_year)
    payload = entry.model_dump(exclude_none=True)
    payload["user_id"] = user_id
    response = sb.table("education").insert(payload).execute()
    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create education entry")
    return response.data[0]


@app.put("/education/{entry_id}")
def update_education(
    entry_id: str,
    entry: EducationUpdate,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    payload = entry.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    _EDUCATION_REQUIRED_FIELDS = ("institution", "degree", "field_of_study", "start_year")
    for field in _EDUCATION_REQUIRED_FIELDS:
        if field in payload and payload[field] is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
    existing_resp = (
        sb.table("education").select("*").eq("id", entry_id).eq("user_id", user_id).execute()
    )
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch education entry")
    if not existing_resp.data:
        raise HTTPException(status_code=404, detail="Education entry not found")
    existing = existing_resp.data[0]
    effective_start = payload.get("start_year", existing.get("start_year"))
    effective_end = payload.get("end_year", existing.get("end_year"))
    _validate_education_years(effective_start, effective_end)
    response = (
        sb.table("education").update(payload).eq("id", entry_id).eq("user_id", user_id).execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to update education entry")
    if not response.data:
        raise HTTPException(status_code=404, detail="Education entry not found")
    return response.data[0]


@app.delete("/education/{entry_id}")
def delete_education(entry_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    response = sb.table("education").delete().eq("id", entry_id).eq("user_id", user_id).execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to delete education entry")
    if not response.data:
        raise HTTPException(status_code=404, detail="Education entry not found")
    return Response(status_code=204)
