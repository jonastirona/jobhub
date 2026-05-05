import calendar
import json
import logging
import os
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from math import ceil
from pathlib import Path
from typing import Optional

import sentry_sdk
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from groq import Groq
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

_sentry_dsn = os.getenv("SENTRY_DSN")
if _sentry_dsn:
    sentry_sdk.init(dsn=_sentry_dsn, traces_sample_rate=0.1, send_default_pii=False)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


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
# Must stay in sync with the DB CHECK constraint added in migration 016
# (`documents_status_allowed_values`).
DOCUMENT_STATUSES = {"draft", "final", "archived"}
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
        sentry_sdk.set_user({"id": response.user.id})
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
    is_archived: bool = False


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
    is_archived: Optional[bool] = None
    research: Optional[str] = None


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


def _validate_reminder_due_date(value: str) -> None:
    try:
        parsed = date.fromisoformat(value.split("T", 1)[0])
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422, detail="Invalid due_date")
    if parsed < date.today():
        raise HTTPException(status_code=422, detail="due_date cannot be in the past")


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


class DocumentPatch(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    job_id: Optional[str] = None

class DocumentDuplicate(BaseModel):
    name: Optional[str] = None


class DocumentDuplicate(BaseModel):
    name: Optional[str] = None


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


def _assert_document_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    s = str(status).strip().lower()
    if not s:
        return None
    if s not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=422, detail="status must be one of: draft, final, archived")
    return s


def _normalize_document_name(name: Optional[str]) -> str:
    return " ".join(str(name or "").strip().split()).lower()


def _assert_document_name_available_for_user(
    sb,
    user_id: str,
    name: str,
    doc_type: Optional[str],
    job_id: Optional[str],
    exclude_document_id: Optional[str] = None,
    allow_version_group_id: Optional[str] = None,
) -> None:
    normalized_name = _normalize_document_name(name)
    if not normalized_name:
        raise HTTPException(status_code=422, detail="name must not be blank")

    response = (
        sb.table("documents")
        .select("id, name, doc_type, job_id, version_group_id")
        .eq("user_id", user_id)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to validate document name")

    normalized_doc_type = (doc_type or "Draft").strip() or "Draft"
    for row in response.data or []:
        if exclude_document_id and row.get("id") == exclude_document_id:
            continue
        if allow_version_group_id and row.get("version_group_id") == allow_version_group_id:
            continue
        if _normalize_document_name(row.get("name")) != normalized_name:
            continue
        if (row.get("doc_type") or "Draft") != normalized_doc_type:
            continue
        if row.get("job_id") != job_id:
            continue
        raise HTTPException(
            status_code=409,
            detail="A document with the same name, type, and linked job already exists",
        )


def _get_document_for_user(sb, user_id: str, document_id: Optional[str]) -> Optional[dict]:
    if not document_id:
        return None
    response = (
        sb.table("documents").select("*").eq("id", document_id).eq("user_id", user_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
    return response.data[0]


def _get_next_document_version_number(sb, user_id: str, version_group_id: str) -> int:
    response = (
        sb.table("documents")
        .select("version_number")
        .eq("user_id", user_id)
        .eq("version_group_id", version_group_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return 1
    latest = response.data[0].get("version_number") or 0
    return int(latest) + 1


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
    base = SUPABASE_URL.rstrip("/")
    path = signed_url.lstrip("/")
    return f"{base}/storage/v1/{path}"


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


# this is how you search with fragments
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


# build your search query here with fragments
def _job_matches_query(job: dict, normalized_query: str) -> bool:
    return any(normalized_query in fragment for fragment in _job_search_fragments(job))


def _is_job_archived(job: dict) -> bool:
    return bool(job.get("is_archived") is True)


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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _analytics_stage_key(raw: Optional[str]) -> str:
    if raw is None or not str(raw).strip():
        return "unknown"
    normalized = _normalize_job_status_alias(str(raw).strip().lower())
    if normalized and normalized in JOB_STATUSES:
        return normalized
    return str(raw).strip().lower() or "unknown"


def _stage_display_label(stage_key: str) -> str:
    return stage_key.replace("_", " ").title()


def _build_job_analytics_payload(job: dict, history: list[dict], as_of: datetime) -> dict:
    """Conversion = count of status transitions (from_status set) in rolling windows.

    Time in stage = cumulative seconds in each to_status between history rows,
    plus an open-ended tail to as_of.
    """
    as_of = _ensure_utc(as_of)
    cut_7d = as_of - timedelta(days=7)
    cut_30d = as_of - timedelta(days=30)

    def is_tracked_change(row: dict) -> bool:
        fs = row.get("from_status")
        return fs is not None and str(fs).strip() != ""

    def changed_at_utc(row: dict) -> Optional[datetime]:
        dt = _parse_datetime_value(row.get("changed_at"))
        return _ensure_utc(dt) if dt is not None else None

    status_changes_last_7_days = 0
    status_changes_last_30_days = 0
    for row in history:
        if not is_tracked_change(row):
            continue
        dt = changed_at_utc(row)
        if dt is None:
            continue
        if dt >= cut_7d:
            status_changes_last_7_days += 1
        if dt >= cut_30d:
            status_changes_last_30_days += 1

    seconds_by_stage: dict[str, int] = defaultdict(int)

    def add_segment(stage_raw: Optional[str], t0: Optional[datetime], t1: datetime) -> None:
        if t0 is None:
            return
        t0 = _ensure_utc(t0)
        t1 = _ensure_utc(t1)
        if t1 <= t0:
            return
        key = _analytics_stage_key(stage_raw)
        seconds_by_stage[key] += int((t1 - t0).total_seconds())

    # Normalize history into (changed_at_dt, row) tuples once to avoid reparsing
    rows_with_dt = [(dt, r) for r in history if (dt := changed_at_utc(r)) is not None]
    rows_with_dt.sort(key=lambda x: x[0])

    if not rows_with_dt:
        anchor = _parse_datetime_value(job.get("created_at"))
        if anchor is None:
            anchor = as_of
        else:
            anchor = _ensure_utc(anchor)
        add_segment(job.get("status"), anchor, as_of)
    else:
        for i in range(len(rows_with_dt) - 1):
            t0, r0 = rows_with_dt[i]
            t1, _ = rows_with_dt[i + 1]
            add_segment(r0.get("to_status"), t0, t1)
        t_last, _ = rows_with_dt[-1]
        add_segment(job.get("status"), t_last, as_of)

    current_status_raw = job.get("status")
    current_stage_key = (
        _analytics_stage_key(current_status_raw)
        if current_status_raw is not None and str(current_status_raw).strip()
        else None
    )
    if current_stage_key is not None and current_stage_key not in seconds_by_stage:
        seconds_by_stage[current_stage_key] = 0

    time_in_stage = {
        stage: {
            "seconds": secs,
            "label": _stage_display_label(stage),
            "is_current": stage == current_stage_key,
        }
        for stage, secs in sorted(seconds_by_stage.items(), key=lambda kv: (-kv[1], kv[0]))
        if secs > 0 or stage == current_stage_key
    }

    return {
        "job_id": str(job.get("id") or ""),
        "current_status": current_stage_key,
        "status_changes_last_7_days": status_changes_last_7_days,
        "status_changes_last_30_days": status_changes_last_30_days,
        "time_in_stage": time_in_stage,
        "as_of": as_of.isoformat(),
    }


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


def _validate_deadline(deadline: Optional[date], applied_date: Optional[date]) -> None:
    if deadline is None:
        return
    if deadline < date.today():
        raise HTTPException(status_code=422, detail="Deadline cannot be before today.")
    if applied_date is not None and deadline < applied_date:
        raise HTTPException(status_code=422, detail="Deadline cannot be before the applied date.")


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


# filtering occurs here.
@app.get("/jobs")
def list_jobs(
    authorization: Optional[str] = Header(default=None),
    q: Optional[str] = Query(default=None),
    statuses: Optional[list[str]] = Query(default=None),
    locations: Optional[list[str]] = Query(default=None),
    deadline_states: Optional[list[str]] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    include_archived: bool = Query(default=False),
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
    visible_jobs = (
        list(all_user_jobs)
        if include_archived
        else [job for job in all_user_jobs if not _is_job_archived(job)]
    )

    normalized_query = (q or "").strip().lower()
    if normalized_query:
        jobs_after_search = [
            job for job in visible_jobs if _job_matches_query(job, normalized_query)
        ]
    else:
        jobs_after_search = list(visible_jobs)

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

    # where all the filtering happens
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
    _validate_deadline(job.deadline, job.applied_date)
    payload = job.model_dump(exclude_none=True)
    if "status" in payload:
        payload["status"] = _normalize_job_status(payload["status"])
    payload["user_id"] = user_id
    payload["is_archived"] = bool(payload.get("is_archived", False))
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
        history_entry["changed_at"] = f"{created['applied_date']}T12:00:00+00:00"
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


@app.get("/jobs/{job_id}/analytics")
def get_job_analytics(job_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    job_response = sb.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_response.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = job_response.data[0]
    hist_response = (
        sb.table("job_status_history")
        .select("*")
        .eq("job_id", job_id)
        .eq("user_id", user_id)
        .order("changed_at", desc=False)
        .execute()
    )
    if hist_response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch job status history")
    history = hist_response.data or []
    return _build_job_analytics_payload(job, history, _utc_now())


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
    existing_row = existing.data[0]
    if "deadline" in payload:
        existing_deadline = _parse_job_date_value(existing_row.get("deadline"))
        if job.deadline != existing_deadline:
            effective_applied = (
                job.applied_date
                if "applied_date" in payload
                else _parse_job_date_value(existing_row.get("applied_date"))
            )
            _validate_deadline(job.deadline, effective_applied)
    old_status = existing_row["status"]
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


DOCUMENT_SORT_OPTIONS = {"updated_at", "created_at", "name"}
DOCUMENT_TYPE_OPTIONS = {"Resume", "Cover Letter", "Draft", "Other"}


@app.get("/documents")
def list_documents(
    authorization: Optional[str] = Header(default=None),
    doc_type: Optional[str] = Query(default=None),
    sort_by: str = Query(default="updated_at"),
    include_archived: bool = Query(default=False),
):
    user_id = get_user_id(authorization)
    if sort_by not in DOCUMENT_SORT_OPTIONS:
        allowed = ", ".join(sorted(DOCUMENT_SORT_OPTIONS))
        raise HTTPException(
            status_code=422, detail=f"unsupported sort_by value; allowed: {allowed}"
        )
    normalized_doc_type = doc_type.strip() if isinstance(doc_type, str) else None
    if normalized_doc_type and normalized_doc_type not in DOCUMENT_TYPE_OPTIONS:
        raise HTTPException(status_code=422, detail="doc_type contains unsupported values")
    sb = get_supabase()
    query = sb.table("documents").select("*, jobs(title, company)").eq("user_id", user_id)
    if not include_archived:
        query = query.or_("status.neq.archived,status.is.null")
    if normalized_doc_type:
        if normalized_doc_type == "Draft":
            query = query.or_("doc_type.eq.Draft,doc_type.is.null")
        else:
            query = query.eq("doc_type", normalized_doc_type)
    query = query.order(sort_by, desc=(sort_by != "name"))
    response = query.execute()
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch documents")
    return response.data or []


@app.post("/documents", status_code=201)
async def create_document(
    name: str = Form(...),
    doc_type: str = Form("Draft"),
    job_id: Optional[str] = Form(default=None),
    source_document_id: Optional[str] = Form(default=None),
    content: Optional[str] = Form(default=None),
    status: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    trimmed_name = (name or "").strip()
    if not trimmed_name:
        raise HTTPException(status_code=422, detail="name must not be blank")
    trimmed_doc_type = (doc_type or "").strip() or "Draft"
    source_document = _get_document_for_user(sb, user_id, source_document_id)
    _assert_linked_job_exists_for_user(sb, user_id, job_id)
    normalized_status = _assert_document_status(status)
    _assert_document_name_available_for_user(
        sb,
        user_id,
        trimmed_name,
        trimmed_doc_type,
        job_id,
        allow_version_group_id=source_document.get("version_group_id") if source_document else None,
    )
    parsed_tags = None
    if tags:
        # Accept either JSON array or comma-separated list
        t = tags.strip()
        try:
            parsed = json.loads(t)
        except json.JSONDecodeError:
            # fallback to comma-separated
            parsed_tags = [p.strip() for p in t.split(",") if p.strip()]
        else:
            if not isinstance(parsed, list):
                raise HTTPException(
                    status_code=422,
                    detail="tags must be a JSON array or comma-separated list",
                )
            parsed_tags = [str(x).strip() for x in parsed if str(x).strip()]

    version_group_id = str(uuid.uuid4())
    version_number = 1
    previous_version_id = None
    storage_path = None
    mime_type = PDF_MIME_TYPE
    file_size = None
    original_filename = None
    if source_document:
        version_group_id = source_document.get("version_group_id") or source_document.get("id")
        version_number = _get_next_document_version_number(sb, user_id, version_group_id)
        previous_version_id = source_document.get("id")

    resolved_job_id = job_id or (source_document.get("job_id") if source_document else None)

    if file is not None:
        storage_path, mime_type, file_size = await _upload_document_to_storage(sb, user_id, file)
        original_filename = file.filename
    elif source_document:
        source_path = source_document.get("storage_path")
        source_bucket = source_document.get("storage_bucket") or DOCUMENTS_BUCKET
        if not source_path:
            raise HTTPException(status_code=404, detail="Document file not found")
        source_extension = Path(source_path).suffix.lower().strip() or PDF_EXTENSION
        storage_path = _build_storage_document_path(user_id, source_extension)
        try:
            sb.storage.from_(source_bucket).copy(source_path, storage_path)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to copy document file")
        mime_type = source_document.get("mime_type") or PDF_MIME_TYPE
        file_size = source_document.get("file_size")
        original_filename = source_document.get("original_filename")
    else:
        raise HTTPException(status_code=422, detail="Document file is required")

    payload = {
        "user_id": user_id,
        "job_id": resolved_job_id,
        "name": trimmed_name,
        "doc_type": trimmed_doc_type,
        "status": normalized_status,
        "tags": parsed_tags,
        "storage_bucket": DOCUMENTS_BUCKET,
        "storage_path": storage_path,
        "mime_type": mime_type,
        "file_size": file_size,
        "original_filename": original_filename,
        "content": content.strip() if content and content.strip() else None,
        "version_group_id": version_group_id,
        "version_number": version_number,
        "previous_version_id": previous_version_id,
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


@app.get("/documents/{document_id}/versions")
def list_document_versions(document_id: str, authorization: Optional[str] = Header(default=None)):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    source = _get_document_for_user(sb, user_id, document_id)
    version_group_id = source.get("version_group_id") or source.get("id")

    response = (
        sb.table("documents")
        .select("*")
        .eq("user_id", user_id)
        .eq("version_group_id", version_group_id)
        .order("version_number", desc=True)
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=500, detail="Failed to fetch document versions")
    return response.data or []


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


@app.patch("/documents/{document_id}")
def patch_document(
    document_id: str,
    body: DocumentPatch,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    updates: dict = {}
    if body.name is not None:
        trimmed = body.name.strip()
        if not trimmed:
            raise HTTPException(status_code=422, detail="name must not be blank")
        updates["name"] = trimmed
    if body.status is not None:
        if not body.status.strip():
            raise HTTPException(status_code=422, detail="status must not be blank")
        updates["status"] = _assert_document_status(body.status)
    if "job_id" in body.model_fields_set:
        if body.job_id is None:
            updates["job_id"] = None  # explicit unlink
        else:
            normalized_job_id = body.job_id.strip()
            if not normalized_job_id:
                raise HTTPException(status_code=422, detail="job_id must not be blank")
            updates["job_id"] = normalized_job_id
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    sb = get_supabase()
    existing = (
        sb.table("documents").select("*").eq("id", document_id).eq("user_id", user_id).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Document not found")
    current = existing.data[0]
    if "name" in updates:
        _assert_document_name_available_for_user(
            sb,
            user_id,
            updates["name"],
            current.get("doc_type"),
            updates.get("job_id", current.get("job_id")),
            exclude_document_id=document_id,
            allow_version_group_id=current.get("version_group_id"),
        )
    if "job_id" in updates and updates["job_id"] is not None:
        _assert_linked_job_exists_for_user(sb, user_id, updates["job_id"])
    response = (
        sb.table("documents").update(updates).eq("id", document_id).eq("user_id", user_id).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
    if "job_id" in updates:
        joined = (
            sb.table("documents")
            .select("*, jobs(title, company)")
            .eq("id", document_id)
            .eq("user_id", user_id)
            .execute()
        )
        if joined.data:
            return joined.data[0]
    return response.data[0]


@app.post("/documents/{document_id}/duplicate", status_code=201)
def duplicate_document(
    document_id: str,
    body: Optional[DocumentDuplicate] = None,
    authorization: Optional[str] = Header(default=None),
):
    user_id = get_user_id(authorization)
    sb = get_supabase()
    source = _get_document_for_user(sb, user_id, document_id)
    requested_name = (body.name if body else None) or f"Copy of {source.get('name', 'Document')}"
    trimmed_name = requested_name.strip()
    _assert_document_name_available_for_user(
        sb,
        user_id,
        trimmed_name,
        source.get("doc_type"),
        source.get("job_id"),
    )

    source_path = source.get("storage_path")
    bucket = source.get("storage_bucket") or DOCUMENTS_BUCKET
    new_storage_path = None
    if source_path:
        new_storage_path = _build_storage_document_path(user_id, PDF_EXTENSION)
        try:
            sb.storage.from_(bucket).copy(source_path, new_storage_path)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to copy document file")

    # When duplicating a document we treat the duplicate as a separate document
    # (not a new version in the same version group). Create a fresh version_group_id
    # and start at version 1 so both original and duplicate appear as separate items.
    version_group_id = str(uuid.uuid4())
    next_version_number = 1

    payload = {
        "user_id": user_id,
        "job_id": source.get("job_id"),
        "name": trimmed_name,
        "doc_type": source.get("doc_type"),
        "status": source.get("status"),
        "tags": source.get("tags"),
        "storage_bucket": bucket,
        "storage_path": new_storage_path,
        "mime_type": source.get("mime_type"),
        "file_size": source.get("file_size"),
        "original_filename": source.get("original_filename"),
        "content": source.get("content"),
        "version_group_id": version_group_id,
        "version_number": next_version_number,
        "previous_version_id": None,
    }
    try:
        response = sb.table("documents").insert(payload).execute()
    except Exception:
        if new_storage_path:
            _delete_document_from_storage(sb, bucket, new_storage_path)
        raise HTTPException(status_code=500, detail="Failed to duplicate document")
    if not response.data:
        if new_storage_path:
            _delete_document_from_storage(sb, bucket, new_storage_path)
        raise HTTPException(status_code=500, detail="Failed to duplicate document")
    return response.data[0]


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


# --- AI draft generation ---

_ai_rate_limit: dict[str, list[datetime]] = defaultdict(list)
_AI_RATE_LIMIT = 20
_AI_RATE_WINDOW = timedelta(hours=1)


def _check_ai_rate_limit(user_id: str) -> None:
    now = datetime.utcnow()
    window_start = now - _AI_RATE_WINDOW
    recent_requests = [t for t in _ai_rate_limit.get(user_id, []) if t > window_start]

    if not recent_requests:
        _ai_rate_limit.pop(user_id, None)
    elif len(recent_requests) >= _AI_RATE_LIMIT:
        _ai_rate_limit[user_id] = recent_requests
        raise HTTPException(status_code=429, detail="AI rate limit reached. Try again in an hour.")

    recent_requests.append(now)
    _ai_rate_limit[user_id] = recent_requests


def _fetch_user_context(sb, user_id: str) -> dict:
    profile_resp = sb.table("profiles").select("*").eq("user_id", user_id).execute()
    profile = profile_resp.data[0] if profile_resp.data else {}
    exp_resp = sb.table("experience").select("*").eq("user_id", user_id).order("position").execute()
    skills_resp = sb.table("skills").select("*").eq("user_id", user_id).order("position").execute()
    edu_resp = (
        sb.table("education")
        .select("*")
        .eq("user_id", user_id)
        .order("start_year", desc=True)
        .execute()
    )
    return {
        "profile": profile,
        "experience": exp_resp.data or [],
        "skills": skills_resp.data or [],
        "education": edu_resp.data or [],
    }


def _fmt_experience(entries: list) -> str:
    if not entries:
        return "None provided."
    parts = []
    for e in entries:
        years = f"{e.get('start_year')}–{e.get('end_year') or 'Present'}"
        line = f"- {e.get('title')} at {e.get('company')}"
        if e.get("location"):
            line += f", {e['location']}"
        line += f" ({years})"
        if e.get("description"):
            line += f"\n  {e['description']}"
        parts.append(line)
    return "\n".join(parts)


def _fmt_skills(entries: list) -> str:
    if not entries:
        return "None provided."
    return ", ".join(
        f"{e['name']}{' (' + e['proficiency'] + ')' if e.get('proficiency') else ''}"
        for e in entries
    )


def _fmt_education(entries: list) -> str:
    if not entries:
        return "None provided."
    parts = []
    for e in entries:
        years = f"{e.get('start_year')}–{e.get('end_year') or 'Present'}"
        parts.append(
            f"- {e.get('degree')} in {e.get('field_of_study')}, {e.get('institution')} ({years})"
        )
    return "\n".join(parts)


def _build_resume_prompt(ctx: dict, job: dict) -> str:
    p = ctx["profile"]
    return f"""You are a professional resume writer.
Generate a clean, ATS-friendly resume tailored to the job below.

CANDIDATE:
Name: {p.get("full_name") or "Not provided"}
Headline: {p.get("headline") or ""}
Location: {p.get("location") or ""}
Summary: {p.get("summary") or ""}
LinkedIn: {p.get("linkedin_url") or ""}
GitHub: {p.get("github_url") or ""}

EXPERIENCE:
{_fmt_experience(ctx["experience"])}

EDUCATION:
{_fmt_education(ctx["education"])}

SKILLS:
{_fmt_skills(ctx["skills"])}

TARGET JOB:
Title: {job.get("title")}
Company: {job.get("company")}
Description: {job.get("description") or "Not provided"}

Write a complete resume tailored to this role. Use this exact markdown hierarchy:
- # for the candidate name only (once, at the top)
- ## for section headings (Summary, Experience, Education, Skills)
- ### for individual job titles / degree entries within sections
- Plain text or bullet points (-) for descriptions and details

Always include year ranges (e.g. 2020 – 2023, or 2021 – Present) for every
experience and education entry. Never omit dates.
Be concise and professional. Do not invent information not in the profile.
Output only the resume. No commentary, disclaimers, notes, or explanations before or after.

IMPORTANT: The resume must fit on a single page. Keep the total content under 450 words.
Limit bullet points to 2–3 per role. Write tight, punchy bullets. Omit or condense
older or less relevant positions if needed to stay within one page."""


def _build_cover_letter_prompt(ctx: dict, job: dict) -> str:
    p = ctx["profile"]
    full_name = p.get("full_name") or "the candidate"
    return f"""You are a professional cover letter writer.
Write a compelling cover letter for the candidate below applying to the specified role.

CANDIDATE:
Name: {p.get("full_name") or "Not provided"}
Headline: {p.get("headline") or ""}
Summary: {p.get("summary") or ""}

EXPERIENCE:
{_fmt_experience(ctx["experience"])}

SKILLS:
{_fmt_skills(ctx["skills"])}

TARGET JOB:
Title: {job.get("title")}
Company: {job.get("company")}
Description: {job.get("description") or "Not provided"}

Write a professional cover letter (3-4 paragraphs). Use markdown: # for the subject
line, ## for any section if needed. Open with a strong hook referencing the role,
highlight specific experience matching the job, and close with a call to action.
End the letter with "Thank you for your consideration, {full_name}".
Do not invent information not in the profile."""


def _build_rewrite_prompt(content: str, instructions: str) -> str:
    return f"""You are a professional document editor.
Rewrite the draft below according to the user's instructions.

CURRENT DRAFT:
{content}

USER INSTRUCTIONS:
{instructions}

Return only the rewritten document. No commentary, no preamble, no explanation."""


def _build_company_research_prompt(job: dict, context: str) -> str:
    return f"""You are a career research assistant helping a job candidate.

COMPANY: {job.get("company")}
ROLE: {job.get("title")}
JOB DESCRIPTION: {job.get("description") or "Not provided"}

CANDIDATE'S RESEARCH REQUEST:
{context}

Write a concise, conversational research briefing that directly answers the
candidate's questions. This is NOT a resume or formal document — write in plain
prose and bullet points, like a well-informed friend giving advice.

Format using markdown:
- ## for section headings (keep them short and descriptive)
- Bullet points (-) for lists of facts or tips
- **Bold** only for genuinely important terms

Do not use headers like "Name:", "Company:", or any resume-style structure.
Do not number every point or create a document outline.
Just answer the questions clearly and practically.

If you are uncertain about specific facts (e.g. exact revenue, headcount),
say so and suggest reliable sources like the company website, LinkedIn, or
Glassdoor. Do not fabricate figures."""


def _call_groq(prompt: str) -> str:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=503, detail="AI service is not configured")
    try:
        client = Groq(api_key=groq_key)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(e)}")


class GenerateDraftRequest(BaseModel):
    type: str
    job_id: str


class RewriteDraftRequest(BaseModel):
    content: str
    instructions: str


class CompanyResearchRequest(BaseModel):
    job_id: str
    context: str


@app.post("/ai/generate")
def generate_draft(
    request: GenerateDraftRequest, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    if request.type not in {"resume", "cover_letter"}:
        raise HTTPException(status_code=422, detail="type must be 'resume' or 'cover_letter'")
    _check_ai_rate_limit(user_id)
    sb = get_supabase()
    job_resp = (
        sb.table("jobs").select("*").eq("id", request.job_id).eq("user_id", user_id).execute()
    )
    if not job_resp.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = job_resp.data[0]
    ctx = _fetch_user_context(sb, user_id)
    prompt = (
        _build_resume_prompt(ctx, job)
        if request.type == "resume"
        else _build_cover_letter_prompt(ctx, job)
    )
    return {"content": _call_groq(prompt)}


@app.post("/ai/rewrite")
def rewrite_draft(
    request: RewriteDraftRequest, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    if not request.content.strip():
        raise HTTPException(status_code=422, detail="content must not be blank")
    if not request.instructions.strip():
        raise HTTPException(status_code=422, detail="instructions must not be blank")
    _check_ai_rate_limit(user_id)
    prompt = _build_rewrite_prompt(request.content, request.instructions)
    return {"content": _call_groq(prompt)}


@app.post("/ai/company-research")
def company_research(
    request: CompanyResearchRequest, authorization: Optional[str] = Header(default=None)
):
    user_id = get_user_id(authorization)
    if not request.context.strip():
        raise HTTPException(status_code=422, detail="context must not be blank")
    _check_ai_rate_limit(user_id)
    sb = get_supabase()
    job_resp = (
        sb.table("jobs").select("*").eq("id", request.job_id).eq("user_id", user_id).execute()
    )
    if not job_resp.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = job_resp.data[0]
    prompt = _build_company_research_prompt(job, request.context.strip())
    return {"content": _call_groq(prompt)}


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
    _validate_reminder_due_date(reminder.due_date)
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
    if "due_date" in payload and payload["due_date"] is not None:
        _validate_reminder_due_date(payload["due_date"])
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
    try:
        existing_resp = sb.table("experience").select("*").eq("user_id", user_id).execute()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to validate experience for reorder")
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to validate experience for reorder")
    existing_by_id = {r["id"]: r for r in existing_resp.data}
    existing_ids = list(existing_by_id.keys())
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
        original_positions = {r["id"]: r["position"] for r in existing_resp.data if "position" in r}
        max_existing_pos = max((r.get("position", 0) for r in existing_resp.data), default=-1)

        def _restore_experience_positions():
            try:
                for entry_id, pos in original_positions.items():
                    sb.table("experience").update({"position": pos}).eq("id", entry_id).eq(
                        "user_id", user_id
                    ).execute()
            except Exception:
                pass

        # Phase 1: batch upsert with full row data + temp positions to avoid the
        # UNIQUE (user_id, position) constraint. Using full rows means no columns are nulled.
        # Temp positions are all > max_existing_pos so they never collide with current values.
        temp_rows = [
            {**existing_by_id[entry_id], "position": max_existing_pos + 1 + i}
            for i, entry_id in enumerate(data.ids)
        ]
        try:
            sb.table("experience").upsert(temp_rows, on_conflict="id").execute()
        except Exception:
            logger.exception("Failed to reorder experience (phase 1) for user %s", user_id)
            raise HTTPException(status_code=500, detail="Failed to reorder experience")

        # Phase 2: batch upsert with final 0..n-1 positions.
        # After phase 1 all positions are temp values, so 0..n-1 are free.
        final_rows = [
            {**existing_by_id[entry_id], "position": position}
            for position, entry_id in enumerate(data.ids)
        ]
        try:
            sb.table("experience").upsert(final_rows, on_conflict="id").execute()
            result = sb.table("experience").select("*").eq("user_id", user_id).execute()
        except Exception:
            logger.exception("Failed to reorder experience (phase 2) for user %s", user_id)
            _restore_experience_positions()
            raise HTTPException(status_code=500, detail="Failed to reorder experience")

        if not result.data or {r["id"] for r in result.data} != set(data.ids):
            _restore_experience_positions()
            raise HTTPException(status_code=500, detail="Failed to reorder experience")
        updated_by_id = {r["id"]: r for r in result.data}
        return [updated_by_id[entry_id] for entry_id in data.ids]
    return []


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
    try:
        existing_resp = sb.table("skills").select("*").eq("user_id", user_id).execute()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to validate skills for reorder")
    if existing_resp.data is None:
        raise HTTPException(status_code=500, detail="Failed to validate skills for reorder")
    existing_by_id = {r["id"]: r for r in existing_resp.data}
    existing_ids = list(existing_by_id.keys())
    if len(data.ids) != len(set(data.ids)):
        raise HTTPException(status_code=400, detail="Skill ids must be unique")
    if set(data.ids) != set(existing_ids):
        raise HTTPException(
            status_code=400,
            detail="ids must contain each of the authenticated user's skills exactly once",
        )
    if data.ids:
        original_positions = {r["id"]: r["position"] for r in existing_resp.data if "position" in r}
        max_existing_pos = max((r.get("position", 0) for r in existing_resp.data), default=-1)

        def _restore_skills_positions():
            try:
                for skill_id, pos in original_positions.items():
                    sb.table("skills").update({"position": pos}).eq("id", skill_id).eq(
                        "user_id", user_id
                    ).execute()
            except Exception:
                pass

        # Phase 1: batch upsert with full row data + temp positions.
        # Full rows prevent any columns from being nulled out.
        temp_rows = [
            {**existing_by_id[skill_id], "position": max_existing_pos + 1 + i}
            for i, skill_id in enumerate(data.ids)
        ]
        try:
            sb.table("skills").upsert(temp_rows, on_conflict="id").execute()
        except Exception:
            logger.exception("Failed to reorder skills (phase 1) for user %s", user_id)
            raise HTTPException(status_code=500, detail="Failed to reorder skills")

        # Phase 2: batch upsert with final 0..n-1 positions.
        final_rows = [
            {**existing_by_id[skill_id], "position": position}
            for position, skill_id in enumerate(data.ids)
        ]
        try:
            sb.table("skills").upsert(final_rows, on_conflict="id").execute()
            result = sb.table("skills").select("*").eq("user_id", user_id).execute()
        except Exception:
            logger.exception("Failed to reorder skills (phase 2) for user %s", user_id)
            _restore_skills_positions()
            raise HTTPException(status_code=500, detail="Failed to reorder skills")

        if not result.data or {r["id"] for r in result.data} != set(data.ids):
            _restore_skills_positions()
            raise HTTPException(status_code=500, detail="Failed to reorder skills")
        updated_by_id = {r["id"]: r for r in result.data}
        return [updated_by_id[skill_id] for skill_id in data.ids]
    return []


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
