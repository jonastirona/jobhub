"""
Backend tests for jobhub.

Supabase is fully mocked — no live database or credentials required.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from pydantic import ValidationError

from main import (
    JOB_STATUSES,
    PROFILE_REQUIRED_FIELDS,
    CareerPreferencesUpsert,
    DocumentUpdate,
    EducationCreate,
    EducationUpdate,
    ExperienceCreate,
    ExperienceReorder,
    ExperienceUpdate,
    InterviewEventCreate,
    InterviewEventUpdate,
    JobCreate,
    JobUpdate,
    ProfileUpsert,
    ReminderCreate,
    ReminderUpdate,
    SkillCreate,
    SkillReorder,
    SkillUpdate,
    _normalize_profile_value,
    app,
    get_profile_completion,
)

client = TestClient(app)

# ---------------------------------------------------------------------------
# Shared test fixtures
# ---------------------------------------------------------------------------

MOCK_USER_ID = "test-user-uuid-1234"
MOCK_TOKEN = "mock-bearer-token"
AUTH_HEADER = f"Bearer {MOCK_TOKEN}"

SAMPLE_JOB = {
    "id": "job-uuid-5678",
    "user_id": MOCK_USER_ID,
    "title": "Backend Engineer",
    "company": "TechCorp",
    "location": "Remote",
    "status": "applied",
    "applied_date": None,
    "deadline": None,
    "description": None,
    "notes": None,
    "recruiter_notes": None,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

SAMPLE_DOCUMENT = {
    "id": "doc-uuid-3322",
    "user_id": MOCK_USER_ID,
    "job_id": SAMPLE_JOB["id"],
    "name": "Datadog_Backend_Engineer_Draft",
    "doc_type": "Cover Letter Draft",
    "storage_bucket": "documents",
    "storage_path": f"{MOCK_USER_ID}/doc-uuid-3322.pdf",
    "mime_type": "application/pdf",
    "file_size": 1024,
    "original_filename": "draft.pdf",
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}


def make_mock_sb(data=None):
    """
    Return a fully mocked Supabase client.

    - auth.get_user() resolves to MOCK_USER_ID
    - table() chains (select/insert/update/delete/upsert/eq/order) all return self
    - execute() returns a response whose .data equals the provided list
    """
    mock_sb = MagicMock()

    # Auth
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    # Table query chain
    mock_result = MagicMock()
    mock_result.data = data if data is not None else []

    mock_query = MagicMock()
    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "upsert",
        "eq",
        "order",
        "in_",
        "or_",
    ):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.return_value = mock_result

    mock_sb.table.return_value = mock_query

    mock_storage = MagicMock()
    mock_storage.create_signed_url.return_value = {
        "signedURL": "https://example.test/storage/v1/object/sign/documents/path"
    }
    mock_storage.upload.return_value = {"path": "uploaded"}
    mock_storage.remove.return_value = []
    mock_sb.storage.from_.return_value = mock_storage

    return mock_sb, mock_query, mock_result


def _make_mock_sb_with_side_effects(*data_list):
    """
    Like make_mock_sb but each successive execute() call returns the next item
    in data_list as its .data value.  Useful for routes that call execute()
    more than once (e.g. POST /experience: position query + insert).
    """
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    results = []
    for data in data_list:
        r = MagicMock()
        r.data = data
        results.append(r)

    mock_query = MagicMock()
    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "upsert",
        "eq",
        "order",
        "limit",
        "in_",
        "or_",
    ):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = results

    mock_sb.table.return_value = mock_query

    mock_storage = MagicMock()
    mock_storage.create_signed_url.return_value = {
        "signedURL": "https://example.test/storage/v1/object/sign/documents/path"
    }
    mock_storage.upload.return_value = {"path": "uploaded"}
    mock_storage.remove.return_value = []
    mock_sb.storage.from_.return_value = mock_storage

    return mock_sb, mock_query


def make_mock_sb_by_table(table_rows: dict[str, list[dict]]):
    """Return a mock Supabase client that can return per-table datasets."""
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    def table_side_effect(table_name):
        rows = table_rows.get(table_name, [])
        result = MagicMock()
        result.data = rows
        query = MagicMock()
        for method in (
            "select",
            "insert",
            "update",
            "delete",
            "upsert",
            "eq",
            "order",
            "limit",
            "in_",
            "or_",
        ):
            getattr(query, method).return_value = query
        query.execute.return_value = result
        return query

    mock_sb.table.side_effect = table_side_effect
    return mock_sb


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


# Verifies the root endpoint responds with service health message.
def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "FastAPI running on Vercel"}


# ---------------------------------------------------------------------------
# Auth guard — every job route must reject requests with no token
# ---------------------------------------------------------------------------


# Verifies listing jobs without auth token returns unauthorized.
def test_list_jobs_requires_auth():
    response = client.get("/jobs")
    assert response.status_code == 401


# Verifies creating a job without auth token returns unauthorized.
def test_create_job_requires_auth():
    response = client.post("/jobs", json={"title": "Engineer", "company": "Acme"})
    assert response.status_code == 401


# Verifies fetching a job without auth token returns unauthorized.
def test_get_job_requires_auth():
    response = client.get("/jobs/some-uuid")
    assert response.status_code == 401


# Verifies updating a job without auth token returns unauthorized.
def test_update_job_requires_auth():
    response = client.put("/jobs/some-uuid", json={"title": "Senior Engineer"})
    assert response.status_code == 401


# Verifies deleting a job without auth token returns unauthorized.
def test_delete_job_requires_auth():
    response = client.delete("/jobs/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /jobs
# ---------------------------------------------------------------------------


# Verifies authenticated users can list their jobs successfully.
def test_list_jobs_returns_user_jobs():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == SAMPLE_JOB["id"]
    assert body["items"][0]["company"] == "TechCorp"
    assert "deadline" in body["items"][0]
    assert "recruiter_notes" in body["items"][0]


# Verifies list endpoint returns an empty array when no jobs exist.
def test_list_jobs_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_list_jobs_hides_archived_by_default():
    active_job = {**SAMPLE_JOB, "id": "job-active", "is_archived": False}
    archived_job = {**SAMPLE_JOB, "id": "job-archived", "is_archived": True}
    mock_sb, _, _ = make_mock_sb(data=[active_job, archived_job])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [row["id"] for row in body["items"]] == ["job-active"]


def test_list_jobs_include_archived_returns_archived_rows():
    active_job = {**SAMPLE_JOB, "id": "job-active", "is_archived": False}
    archived_job = {**SAMPLE_JOB, "id": "job-archived", "is_archived": True}
    mock_sb, _, _ = make_mock_sb(data=[active_job, archived_job])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?include_archived=true",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {row["id"] for row in body["items"]} == {"job-active", "job-archived"}


# Verifies list query always filters by authenticated user_id.
def test_list_jobs_scoped_to_user():
    """Verify the query filters by user_id."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/jobs", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# Verifies GET /jobs?q filters results across searchable job text fields.
def test_list_jobs_q_filters_across_text_fields():
    matching_by_description = {
        **SAMPLE_JOB,
        "id": "job-desc-match",
        "description": "Scaling distributed keyword index",
    }
    matching_by_location = {
        **SAMPLE_JOB,
        "id": "job-location-match",
        "location": "San Francisco",
    }
    matching_by_status = {
        **SAMPLE_JOB,
        "id": "job-status-match",
        "status": "interviewing",
    }
    matching_by_applied_date = {
        **SAMPLE_JOB,
        "id": "job-date-match",
        "applied_date": "2026-03-15",
    }
    non_match = {
        **SAMPLE_JOB,
        "id": "job-no-match",
        "title": "Product Manager",
        "company": "Other Co",
        "location": "Remote",
        "description": "Roadmap and planning",
        "notes": "General note",
    }
    mock_sb, _, _ = make_mock_sb(
        data=[
            matching_by_description,
            matching_by_location,
            matching_by_status,
            matching_by_applied_date,
            non_match,
        ]
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?q=francisco",
            headers={"authorization": AUTH_HEADER},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] == "job-location-match"

    with patch("main.get_supabase", return_value=mock_sb):
        status_response = client.get(
            "/jobs?q=interviewing",
            headers={"authorization": AUTH_HEADER},
        )
    assert status_response.status_code == 200
    assert status_response.json()["items"][0]["id"] == "job-status-match"

    with patch("main.get_supabase", return_value=mock_sb):
        date_response = client.get(
            "/jobs?q=2026-03-15",
            headers={"authorization": AUTH_HEADER},
        )
    assert date_response.status_code == 200
    assert date_response.json()["items"][0]["id"] == "job-date-match"

    matching_by_recruiter = {
        **SAMPLE_JOB,
        "id": "job-recruiter-match",
        "recruiter_notes": "Reach out to Alex Chen before onsite",
    }
    matching_by_deadline = {
        **SAMPLE_JOB,
        "id": "job-deadline-match",
        "deadline": "2026-07-04",
    }
    mock_sb2, _, _ = make_mock_sb(
        data=[
            matching_by_recruiter,
            matching_by_deadline,
            non_match,
        ]
    )
    with patch("main.get_supabase", return_value=mock_sb2):
        recruiter_response = client.get(
            "/jobs?q=alex+chen",
            headers={"authorization": AUTH_HEADER},
        )
    assert recruiter_response.status_code == 200
    assert len(recruiter_response.json()["items"]) == 1
    assert recruiter_response.json()["items"][0]["id"] == "job-recruiter-match"

    with patch("main.get_supabase", return_value=mock_sb2):
        deadline_response = client.get(
            "/jobs?q=2026-07-04",
            headers={"authorization": AUTH_HEADER},
        )
    assert deadline_response.status_code == 200
    assert len(deadline_response.json()["items"]) == 1
    assert deadline_response.json()["items"][0]["id"] == "job-deadline-match"


# Verifies q matches calendar month names, years, day numbers, abbreviations, and notes.
def test_list_jobs_q_month_year_day_tokens_and_notes():
    april_deadline = {
        **SAMPLE_JOB,
        "id": "job-april-deadline",
        "deadline": "2026-04-10",
        "applied_date": None,
    }
    march_applied = {
        **SAMPLE_JOB,
        "id": "job-march-applied",
        "applied_date": "2026-03-20",
        "deadline": None,
    }
    mock_sb, _, _ = make_mock_sb(data=[april_deadline, march_applied])
    with patch("main.get_supabase", return_value=mock_sb):
        april_resp = client.get(
            "/jobs?q=april",
            headers={"authorization": AUTH_HEADER},
        )
    assert april_resp.status_code == 200
    assert len(april_resp.json()["items"]) == 1
    assert april_resp.json()["items"][0]["id"] == "job-april-deadline"

    with patch("main.get_supabase", return_value=mock_sb):
        apr_resp = client.get(
            "/jobs?q=apr",
            headers={"authorization": AUTH_HEADER},
        )
    assert apr_resp.status_code == 200
    assert len(apr_resp.json()["items"]) == 1
    assert apr_resp.json()["items"][0]["id"] == "job-april-deadline"

    july_day4 = {
        **SAMPLE_JOB,
        "id": "job-jul-4",
        "deadline": "2026-07-04",
        "applied_date": None,
    }
    july_day14 = {
        **SAMPLE_JOB,
        "id": "job-jul-14",
        "deadline": "2026-07-14",
        "applied_date": None,
    }
    mock_jul, _, _ = make_mock_sb(data=[july_day4, july_day14])
    with patch("main.get_supabase", return_value=mock_jul):
        jul4_resp = client.get(
            "/jobs?q=jul+4",
            headers={"authorization": AUTH_HEADER},
        )
    assert jul4_resp.status_code == 200
    assert len(jul4_resp.json()["items"]) == 1
    assert jul4_resp.json()["items"][0]["id"] == "job-jul-4"

    year_2027 = {
        **SAMPLE_JOB,
        "id": "job-2027",
        "deadline": "2027-01-01",
        "applied_date": None,
    }
    year_2026 = {
        **SAMPLE_JOB,
        "id": "job-2026-only",
        "deadline": "2026-12-31",
        "applied_date": None,
    }
    mock_y, _, _ = make_mock_sb(data=[year_2027, year_2026])
    with patch("main.get_supabase", return_value=mock_y):
        y_resp = client.get(
            "/jobs?q=2027",
            headers={"authorization": AUTH_HEADER},
        )
    assert y_resp.status_code == 200
    assert len(y_resp.json()["items"]) == 1
    assert y_resp.json()["items"][0]["id"] == "job-2027"

    day_14 = {
        **SAMPLE_JOB,
        "id": "job-day-14",
        "applied_date": "2026-05-14",
        "deadline": None,
    }
    day_15 = {
        **SAMPLE_JOB,
        "id": "job-day-15",
        "applied_date": "2026-05-15",
        "deadline": None,
    }
    mock_d, _, _ = make_mock_sb(data=[day_14, day_15])
    with patch("main.get_supabase", return_value=mock_d):
        d_resp = client.get(
            "/jobs?q=14",
            headers={"authorization": AUTH_HEADER},
        )
    assert d_resp.status_code == 200
    assert len(d_resp.json()["items"]) == 1
    assert d_resp.json()["items"][0]["id"] == "job-day-14"

    notes_job = {
        **SAMPLE_JOB,
        "id": "job-notes-xyz",
        "notes": "Follow up about offer details xyz123",
    }
    other = {
        **SAMPLE_JOB,
        "id": "job-other-notes",
        "notes": "Different content",
    }
    mock_n, _, _ = make_mock_sb(data=[notes_job, other])
    with patch("main.get_supabase", return_value=mock_n):
        n_resp = client.get(
            "/jobs?q=xyz123",
            headers={"authorization": AUTH_HEADER},
        )
    assert n_resp.status_code == 200
    assert len(n_resp.json()["items"]) == 1
    assert n_resp.json()["items"][0]["id"] == "job-notes-xyz"


# Verifies whitespace-only q values are treated as empty search input.
def test_list_jobs_q_ignores_whitespace_only_query():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?q=%20%20",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1


def test_list_jobs_filters_status_location_deadline_state_and_paginates():
    today = date.today().isoformat()
    upcoming = {
        **SAMPLE_JOB,
        "id": "job-upcoming",
        "status": "interviewing",
        "location": "Remote",
        "deadline": "2099-01-01",
    }
    due_today = {
        **SAMPLE_JOB,
        "id": "job-due-today",
        "status": "offered",
        "location": "Remote",
        "deadline": today,
    }
    overdue = {
        **SAMPLE_JOB,
        "id": "job-overdue",
        "status": "offered",
        "location": "Remote",
        "deadline": "2000-01-01",
    }
    no_deadline = {
        **SAMPLE_JOB,
        "id": "job-no-deadline",
        "status": "interviewing",
        "location": "Remote",
        "deadline": None,
    }
    excluded = {
        **SAMPLE_JOB,
        "id": "job-excluded",
        "status": "applied",
        "location": "Onsite",
        "deadline": None,
    }
    mock_sb, _mock_query, _ = make_mock_sb(
        data=[upcoming, due_today, overdue, no_deadline, excluded]
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?statuses=interviewing&statuses=offered&locations=Remote&deadline_states=upcoming&deadline_states=due_today&deadline_states=overdue&deadline_states=no_deadline&page=2&page_size=2",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert body["page"] == 2
    assert body["page_size"] == 2
    assert body["total_pages"] == 2
    assert len(body["items"]) == 2
    # The excluded job (status=applied, location=Onsite) must not appear.
    returned_ids = {row["id"] for row in body["items"]}
    assert "job-excluded" not in returned_ids


def test_list_jobs_locations_filter_is_case_insensitive_and_dedupes_available_locations():
    mixed_case_one = {**SAMPLE_JOB, "id": "job-montreal-title", "location": "Montreal"}
    mixed_case_two = {**SAMPLE_JOB, "id": "job-montreal-lower", "location": "montreal"}
    other_city = {**SAMPLE_JOB, "id": "job-nyc", "location": "New York City"}
    mock_sb, _, _ = make_mock_sb(data=[mixed_case_one, mixed_case_two, other_city])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?locations=montreal",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {job["id"] for job in body["items"]} == {
        "job-montreal-title",
        "job-montreal-lower",
    }
    # available_locations is faceted (excludes the location filter itself),
    # so the other locations in the dataset remain visible for multi-select.
    assert body["available_locations"] == ["Montreal", "New York City"]


def test_list_jobs_rejects_unsupported_sort_by():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs?sort_by=priority", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 422


def test_list_jobs_sort_by_company_applies_globally_before_pagination():
    jobs = [
        {**SAMPLE_JOB, "id": "job-c", "company": "Zeta"},
        {**SAMPLE_JOB, "id": "job-a", "company": "Acme"},
        {**SAMPLE_JOB, "id": "job-b", "company": "Beta"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?sort_by=company&page=2&page_size=2",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert [row["id"] for row in body["items"]] == ["job-c"]


def test_list_jobs_sort_by_deadline_puts_null_deadlines_last():
    jobs = [
        {**SAMPLE_JOB, "id": "job-null", "deadline": None},
        {**SAMPLE_JOB, "id": "job-old", "deadline": "2026-01-01"},
        {**SAMPLE_JOB, "id": "job-new", "deadline": "2026-12-31"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs?sort_by=deadline", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["items"]] == [
        "job-new",
        "job-old",
        "job-null",
    ]


def test_list_jobs_sort_by_last_activity_uses_history_and_puts_missing_bottom():
    jobs = [
        {**SAMPLE_JOB, "id": "job-1"},
        {**SAMPLE_JOB, "id": "job-2"},
        {**SAMPLE_JOB, "id": "job-3"},
    ]
    history_rows = [
        {"job_id": "job-2", "changed_at": "2026-04-10T12:00:00+00:00"},
        {"job_id": "job-1", "changed_at": "2026-04-05T12:00:00+00:00"},
    ]
    mock_sb = make_mock_sb_by_table(
        {
            "jobs": jobs,
            "job_status_history": history_rows,
        }
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?sort_by=last_activity&page=2&page_size=2",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    # Global sort is [job-2, job-1, job-3], so page 2 contains only job-3.
    assert [row["id"] for row in body["items"]] == ["job-3"]


def test_list_jobs_available_locations_excludes_location_filter_to_allow_multi_select():
    """Selecting one location must not hide other available locations."""
    jobs = [
        {**SAMPLE_JOB, "id": "job-remote", "location": "Remote"},
        {**SAMPLE_JOB, "id": "job-boston", "location": "Boston, MA"},
        {**SAMPLE_JOB, "id": "job-nyc", "location": "New York City"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?locations=Remote",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert {row["id"] for row in body["items"]} == {"job-remote"}
    # Facet must still expose the other locations so the user can multi-select.
    assert body["available_locations"] == ["Boston, MA", "New York City", "Remote"]


def test_list_jobs_location_filter_accepts_values_containing_commas():
    """Locations like 'Boston, MA' must match as a single value, not be split on ','."""
    jobs = [
        {**SAMPLE_JOB, "id": "job-boston", "location": "Boston, MA"},
        {**SAMPLE_JOB, "id": "job-remote", "location": "Remote"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?locations=Boston%2C+MA",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [row["id"] for row in body["items"]] == ["job-boston"]


def test_list_jobs_available_locations_reflect_only_current_jobs():
    """Locations that no longer appear on any job must not be returned."""
    jobs = [
        {**SAMPLE_JOB, "id": "job-remote", "location": "Remote"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json()["available_locations"] == ["Remote"]


def test_list_jobs_available_statuses_excludes_status_filter_to_allow_multi_select():
    """Selecting one status must not hide other available statuses."""
    jobs = [
        {**SAMPLE_JOB, "id": "job-a", "status": "applied"},
        {**SAMPLE_JOB, "id": "job-b", "status": "interviewing"},
        {**SAMPLE_JOB, "id": "job-c", "status": "offered"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?statuses=applied",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert {row["id"] for row in body["items"]} == {"job-a"}
    assert body["available_statuses"] == ["applied", "interviewing", "offered"]


def test_list_jobs_clamps_out_of_range_page_to_last_real_page():
    """Requesting a page past total_pages must not return an empty slice with a ghost page number.

    The server should clamp page into the valid range and echo the clamped
    page in the response so clients never observe `items: []` alongside
    `page: <nonexistent>`.
    """
    jobs = [
        {**SAMPLE_JOB, "id": "job-a", "company": "Acme"},
        {**SAMPLE_JOB, "id": "job-b", "company": "Beta"},
        {**SAMPLE_JOB, "id": "job-c", "company": "Zeta"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?sort_by=company&page=99&page_size=2",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert body["total_pages"] == 2
    # Clamped from the requested page=99 down to the real last page (2).
    assert body["page"] == 2
    # Returns the items of the clamped page, not an empty slice.
    assert [row["id"] for row in body["items"]] == ["job-c"]


def test_list_jobs_clamps_page_to_1_when_there_are_no_jobs():
    """With zero items, the clamped page must be 1, not the requested value."""
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?page=5&page_size=10",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["total_pages"] == 1
    assert body["page"] == 1
    assert body["items"] == []


def test_list_jobs_available_statuses_normalizes_casing_whitespace_and_aliases():
    """Facet statuses must be canonical even if the DB has dirty rows.

    available_statuses should mirror the normalization the filter/counts
    paths do (strip + lowercase + alias), and drop values that are not
    canonical JOB_STATUSES — otherwise the UI facet would show ghost
    options like 'Applied ' or 'interview' that the filter endpoint
    would then 422 on.
    """
    jobs = [
        {**SAMPLE_JOB, "id": "job-canonical", "status": "applied"},
        {**SAMPLE_JOB, "id": "job-titlecase", "status": "Applied"},
        {**SAMPLE_JOB, "id": "job-trailing-space", "status": "interviewing "},
        {**SAMPLE_JOB, "id": "job-alias", "status": "interview"},
        {**SAMPLE_JOB, "id": "job-garbage", "status": "legacy_foo"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    # Exactly the canonical values, no duplicates, no 'legacy_foo'.
    assert response.json()["available_statuses"] == ["applied", "interviewing"]


def test_list_jobs_available_locations_stay_title_cased_when_sort_reorders_rows():
    jobs = [
        {**SAMPLE_JOB, "id": "a", "location": "montreal", "company": "Acme"},
        {**SAMPLE_JOB, "id": "z", "location": "Montreal", "company": "Acme"},
    ]
    mock_sb, _, _ = make_mock_sb(data=jobs)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?sort_by=company",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["available_locations"] == ["Montreal"]


# Verifies user_id ownership filtering remains enforced when q is provided.
def test_list_jobs_q_keeps_user_scope_filter():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(
            "/jobs?q=techcorp",
            headers={"authorization": AUTH_HEADER},
        )
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# POST /jobs
# ---------------------------------------------------------------------------


# Verifies valid payload creates a job and returns created entity.
def test_create_job_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={
                "title": "Backend Engineer",
                "company": "TechCorp",
                "location": "Remote",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["company"] == "TechCorp"


# Verifies create payload is augmented with authenticated user_id.
def test_create_job_sets_user_id():
    """Verify user_id is injected into the insert payload."""
    mock_sb, mock_query, mock_result = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme"},
            headers={"authorization": AUTH_HEADER},
        )
    inserted_payload = mock_query.insert.call_args[0][0]
    assert inserted_payload["user_id"] == MOCK_USER_ID


# Verifies create serializes deadline to ISO date string for Supabase.
def test_create_job_serializes_deadline_in_insert_payload():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={
                "title": "Engineer",
                "company": "Acme",
                "deadline": "2026-08-20",
                "recruiter_notes": "  HR: Pat  ",
            },
            headers={"authorization": AUTH_HEADER},
        )
    # First insert call is for `jobs`; later insert calls may target history.
    inserted = mock_query.insert.call_args_list[0][0][0]
    assert inserted["deadline"] == "2026-08-20"
    assert inserted["recruiter_notes"] == "  HR: Pat  "


# Verifies update serializes deadline in the update payload.
def test_update_job_serializes_deadline_in_update_payload():
    updated = {**SAMPLE_JOB, "deadline": "2026-09-01"}
    mock_sb, mock_query, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"deadline": "2026-09-01"},
            headers={"authorization": AUTH_HEADER},
        )
    update_payload = mock_query.update.call_args[0][0]
    assert update_payload == {"deadline": "2026-09-01"}


# Verifies missing required title fails FastAPI validation.
def test_create_job_missing_title_returns_422():
    response = client.post(
        "/jobs",
        json={"company": "Acme"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


# Verifies missing required company fails FastAPI validation.
def test_create_job_missing_company_returns_422():
    response = client.post(
        "/jobs",
        json={"title": "Engineer"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


# Verifies create endpoint returns 500 when insert result is empty.
def test_create_job_db_failure_returns_500():
    mock_sb, _, mock_result = make_mock_sb(data=[])
    mock_result.data = []  # simulate insert returning nothing
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500


def test_create_job_accepts_new_final_outcome_status():
    accepted_job = {**SAMPLE_JOB, "status": "accepted"}
    mock_sb, _, _ = make_mock_sb(data=[accepted_job])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme", "status": "accepted"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["status"] == "accepted"


def test_create_job_rejects_unknown_status():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme", "status": "unknown-status"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "supported job status" in response.json()["detail"]


def test_create_job_rejects_past_deadline():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme", "deadline": "2000-01-01"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "before today" in response.json()["detail"]


def test_create_job_rejects_deadline_before_applied_date():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={
                "title": "Engineer",
                "company": "Acme",
                "applied_date": "2099-01-02",
                "deadline": "2099-01-01",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "before the applied date" in response.json()["detail"]


def test_create_job_accepts_future_deadline_after_applied_date():
    created = {**SAMPLE_JOB, "applied_date": "2099-01-01", "deadline": "2099-01-02"}
    mock_sb, _, _ = make_mock_sb(data=[created])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/jobs",
            json={
                "title": "Engineer",
                "company": "Acme",
                "applied_date": "2099-01-01",
                "deadline": "2099-01-02",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201


def test_update_job_allows_unchanged_past_deadline():
    existing = {**SAMPLE_JOB, "deadline": "2000-01-01"}
    mock_sb, _, _ = make_mock_sb(data=[existing])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"deadline": "2000-01-01", "title": "New Title"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200


def test_update_job_rejects_newly_changed_past_deadline():
    existing = {**SAMPLE_JOB, "deadline": "2099-01-01"}
    mock_sb, _, _ = make_mock_sb(data=[existing])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"deadline": "2000-01-01"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "before today" in response.json()["detail"]


def test_update_job_rejects_new_deadline_before_existing_applied_date():
    existing = {**SAMPLE_JOB, "applied_date": "2099-06-01", "deadline": "2099-12-01"}
    mock_sb, _, _ = make_mock_sb(data=[existing])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"deadline": "2099-05-31"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "before the applied date" in response.json()["detail"]


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}
# ---------------------------------------------------------------------------


# Verifies fetching an owned job by id returns expected record.
def test_get_job_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/jobs/{SAMPLE_JOB['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["id"] == SAMPLE_JOB["id"]


# Verifies fetching non-existent or inaccessible job returns 404.
def test_get_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs/nonexistent-id", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 404


# Verifies job lookup applies user ownership constraints.
def test_get_job_scoped_to_user():
    """A job belonging to another user must not be returned (RLS + eq filter)."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(f"/jobs/{SAMPLE_JOB['id']}", headers={"authorization": AUTH_HEADER})
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# PUT /jobs/{job_id}
# ---------------------------------------------------------------------------


# Verifies updating an owned job persists and returns updated data.
def test_update_job_success():
    updated = {**SAMPLE_JOB, "status": "interviewing"}
    mock_sb, _, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "interviewing"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["status"] == "interviewing"


# Verifies update returns 404 when target job is not found.
def test_update_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/jobs/nonexistent-id",
            json={"status": "rejected"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


# Verifies empty update payload is rejected with 400.
def test_update_job_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb()
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


# Verifies partial updates only send explicitly provided fields.
def test_update_job_partial_fields():
    """Only provided fields should be in the update payload."""
    updated = {**SAMPLE_JOB, "title": "Staff Engineer"}
    mock_sb, mock_query, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"title": "Staff Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    update_payload = mock_query.update.call_args[0][0]
    assert update_payload == {"title": "Staff Engineer"}
    assert "company" not in update_payload


def test_update_job_accepts_new_final_outcome_status():
    updated = {**SAMPLE_JOB, "status": "withdrawn"}
    mock_sb, _ = _make_mock_sb_with_status_change("applied", "withdrawn")
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "withdrawn"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["status"] == updated["status"]


def test_update_job_rejects_unknown_status():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "unknown-status"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "supported job status" in response.json()["detail"]


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/history
# ---------------------------------------------------------------------------

SAMPLE_HISTORY = [
    {
        "id": "h1",
        "job_id": SAMPLE_JOB["id"],
        "user_id": MOCK_USER_ID,
        "from_status": None,
        "to_status": "applied",
        "changed_at": "2026-04-01T00:00:00+00:00",
    },
    {
        "id": "h2",
        "job_id": SAMPLE_JOB["id"],
        "user_id": MOCK_USER_ID,
        "from_status": "applied",
        "to_status": "interviewing",
        "changed_at": "2026-04-05T14:32:00+00:00",
    },
]

SAMPLE_INTERVIEW_EVENT = {
    "id": "ie-1",
    "job_id": SAMPLE_JOB["id"],
    "user_id": MOCK_USER_ID,
    "round_type": "Phone Screen",
    "scheduled_at": "2026-05-10T15:00:00+00:00",
    "notes": "Discuss system design basics",
    "created_at": "2026-05-01T00:00:00+00:00",
    "updated_at": "2026-05-01T00:00:00+00:00",
}


def test_get_job_history_requires_auth():
    response = client.get(f"/jobs/{SAMPLE_JOB['id']}/history")
    assert response.status_code == 401


def test_get_job_history_returns_entries():
    mock_sb, _, _ = make_mock_sb(data=SAMPLE_HISTORY)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/jobs/{SAMPLE_JOB['id']}/history",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["to_status"] == "applied"
    assert body[1]["from_status"] == "applied"
    assert body[1]["to_status"] == "interviewing"


def test_get_job_history_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/jobs/{SAMPLE_JOB['id']}/history",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json() == []


def test_get_job_history_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=SAMPLE_HISTORY)
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(
            f"/jobs/{SAMPLE_JOB['id']}/history",
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


def test_get_job_history_scoped_to_job():
    mock_sb, mock_query, _ = make_mock_sb(data=SAMPLE_HISTORY)
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(
            f"/jobs/{SAMPLE_JOB['id']}/history",
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("job_id", SAMPLE_JOB["id"]) in eq_calls


# ---------------------------------------------------------------------------
# /jobs/{job_id}/interviews
# ---------------------------------------------------------------------------


def _make_mock_sb_for_interview_create(event_data=None, job_exists=True):
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    job_result = MagicMock()
    job_result.data = [{"id": SAMPLE_JOB["id"]}] if job_exists else []

    insert_result = MagicMock()
    insert_result.data = [event_data] if event_data else []

    mock_query = MagicMock()
    for method in (
        "select",
        "insert",
        "update",
        "delete",
        "upsert",
        "eq",
        "order",
        "limit",
    ):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = [job_result, insert_result]

    mock_sb.table.return_value = mock_query
    return mock_sb, mock_query


def test_get_interviews_requires_auth():
    response = client.get(f"/jobs/{SAMPLE_JOB['id']}/interviews")
    assert response.status_code == 401


def test_create_interview_requires_auth():
    response = client.post(
        f"/jobs/{SAMPLE_JOB['id']}/interviews",
        json={
            "round_type": "Phone Screen",
            "scheduled_at": "2026-05-10T15:00:00+00:00",
        },
    )
    assert response.status_code == 401


def test_update_interview_requires_auth():
    response = client.put(
        f"/jobs/{SAMPLE_JOB['id']}/interviews/ie-1",
        json={"notes": "Updated"},
    )
    assert response.status_code == 401


def test_delete_interview_requires_auth():
    response = client.delete(f"/jobs/{SAMPLE_JOB['id']}/interviews/ie-1")
    assert response.status_code == 401


def test_get_interviews_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_INTERVIEW_EVENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/jobs/{SAMPLE_JOB['id']}/interviews",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()[0]["round_type"] == "Phone Screen"


def test_get_interviews_scoped_to_user_and_job():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_INTERVIEW_EVENT])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(
            f"/jobs/{SAMPLE_JOB['id']}/interviews",
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls
    assert ("job_id", SAMPLE_JOB["id"]) in eq_calls


def test_create_interview_success():
    mock_sb, _ = _make_mock_sb_for_interview_create(
        event_data=SAMPLE_INTERVIEW_EVENT, job_exists=True
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/jobs/{SAMPLE_JOB['id']}/interviews",
            json={
                "round_type": "Phone Screen",
                "scheduled_at": "2026-05-10T15:00:00+00:00",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["round_type"] == "Phone Screen"


def test_create_interview_job_not_found():
    mock_sb, _ = _make_mock_sb_for_interview_create(
        event_data=SAMPLE_INTERVIEW_EVENT, job_exists=False
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/jobs/{SAMPLE_JOB['id']}/interviews",
            json={
                "round_type": "Phone Screen",
                "scheduled_at": "2026-05-10T15:00:00+00:00",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_create_interview_blank_round_type_returns_422():
    mock_sb, _ = _make_mock_sb_for_interview_create(
        event_data=SAMPLE_INTERVIEW_EVENT, job_exists=True
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/jobs/{SAMPLE_JOB['id']}/interviews",
            json={"round_type": "   ", "scheduled_at": "2026-05-10T15:00:00+00:00"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_update_interview_success():
    updated_event = {**SAMPLE_INTERVIEW_EVENT, "notes": "Bring architecture examples"}
    mock_sb, _, _ = make_mock_sb(data=[updated_event])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}/interviews/{SAMPLE_INTERVIEW_EVENT['id']}",
            json={"notes": "Bring architecture examples"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["notes"] == "Bring architecture examples"


def test_update_interview_not_found_returns_404():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}/interviews/missing-event",
            json={"notes": "Updated"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_interview_blank_round_type_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_INTERVIEW_EVENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}/interviews/{SAMPLE_INTERVIEW_EVENT['id']}",
            json={"round_type": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_delete_interview_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_INTERVIEW_EVENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/jobs/{SAMPLE_JOB['id']}/interviews/{SAMPLE_INTERVIEW_EVENT['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# POST /jobs — history side effects
# ---------------------------------------------------------------------------


def test_create_job_inserts_history_row():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme"},
            headers={"authorization": AUTH_HEADER},
        )
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" in table_calls


def test_create_job_history_row_has_correct_fields():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme"},
            headers={"authorization": AUTH_HEADER},
        )
    history_payload = mock_query.insert.call_args_list[-1][0][0]
    assert history_payload["from_status"] is None
    assert history_payload["to_status"] == SAMPLE_JOB["status"]
    assert history_payload["user_id"] == MOCK_USER_ID
    assert history_payload["job_id"] == SAMPLE_JOB["id"]


def test_create_job_history_uses_applied_date_as_changed_at():
    job_with_date = {**SAMPLE_JOB, "applied_date": "2026-04-01"}
    mock_sb, mock_query, _ = make_mock_sb(data=[job_with_date])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme", "applied_date": "2026-04-01"},
            headers={"authorization": AUTH_HEADER},
        )
    history_payload = mock_query.insert.call_args_list[-1][0][0]
    assert history_payload["changed_at"] == "2026-04-01T12:00:00+00:00"


def test_create_job_history_omits_changed_at_when_no_applied_date():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/jobs",
            json={"title": "Engineer", "company": "Acme"},
            headers={"authorization": AUTH_HEADER},
        )
    history_payload = mock_query.insert.call_args_list[-1][0][0]
    assert "changed_at" not in history_payload


# ---------------------------------------------------------------------------
# PUT /jobs/{job_id} — history side effects
# ---------------------------------------------------------------------------


def _make_mock_sb_with_status_change(old_status, new_status):
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    select_result = MagicMock()
    select_result.data = [{**SAMPLE_JOB, "status": old_status}]

    update_result = MagicMock()
    update_result.data = [{**SAMPLE_JOB, "status": new_status}]

    history_result = MagicMock()
    history_result.data = [{"id": "h-new"}]

    mock_query = MagicMock()
    for method in ("select", "insert", "update", "delete", "upsert", "eq", "order"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = [select_result, update_result, history_result]

    mock_sb.table.return_value = mock_query
    return mock_sb, mock_query


def _make_mock_sb_update_without_status(existing_status: str, updated_row: dict):
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    select_result = MagicMock()
    select_result.data = [{**SAMPLE_JOB, "status": existing_status}]

    update_result = MagicMock()
    update_result.data = [updated_row]

    mock_query = MagicMock()
    for method in ("select", "insert", "update", "delete", "upsert", "eq", "order"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = [select_result, update_result]

    mock_sb.table.return_value = mock_query
    return mock_sb, mock_query


def test_update_job_inserts_history_on_status_change():
    mock_sb, mock_query = _make_mock_sb_with_status_change("applied", "interviewing")
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "interviewing"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" in table_calls


def test_update_job_history_row_captures_transition():
    mock_sb, mock_query = _make_mock_sb_with_status_change("applied", "interviewing")
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "interviewing"},
            headers={"authorization": AUTH_HEADER},
        )
    history_payload = mock_query.insert.call_args_list[-1][0][0]
    assert history_payload["from_status"] == "applied"
    assert history_payload["to_status"] == "interviewing"
    assert history_payload["job_id"] == SAMPLE_JOB["id"]
    assert history_payload["user_id"] == MOCK_USER_ID


def test_update_job_no_history_when_status_unchanged():
    mock_sb, mock_query = _make_mock_sb_with_status_change("applied", "applied")
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "applied"},
            headers={"authorization": AUTH_HEADER},
        )
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" not in table_calls


def test_update_job_no_history_when_legacy_alias_normalizes_to_same_status():
    mock_sb, mock_query = _make_mock_sb_with_status_change("offer", "offered")
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "offered"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" not in table_calls


def test_update_job_alias_only_status_change_is_noop_for_jobs_table():
    mock_sb, mock_query, _ = make_mock_sb(data=[{**SAMPLE_JOB, "status": "offer"}])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "offered"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["status"] == "offer"
    mock_query.update.assert_not_called()
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" not in table_calls


def test_update_job_allows_valid_status_when_existing_status_is_legacy_unknown():
    mock_sb, mock_query = _make_mock_sb_with_status_change("legacy-foo", "offered")
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"status": "offered"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    history_payload = mock_query.insert.call_args_list[-1][0][0]
    assert history_payload["from_status"] == "legacy-foo"
    assert history_payload["to_status"] == "offered"


def test_update_job_notes_does_not_validate_legacy_status():
    updated_row = {**SAMPLE_JOB, "status": "unknown-status", "notes": "updated"}
    mock_sb, mock_query = _make_mock_sb_update_without_status("unknown-status", updated_row)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"notes": "updated"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["notes"] == "updated"
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" not in table_calls
    update_payload = mock_query.update.call_args[0][0]
    assert update_payload == {"notes": "updated"}


def test_update_job_no_history_when_status_not_in_payload():
    mock_sb, mock_query = _make_mock_sb_with_status_change("applied", "applied")
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={"title": "Senior Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    table_calls = [call[0][0] for call in mock_sb.table.call_args_list]
    assert "job_status_history" not in table_calls


# ---------------------------------------------------------------------------
# DELETE /jobs/{job_id}
# ---------------------------------------------------------------------------


# Verifies deleting an owned job returns HTTP 204.
def test_delete_job_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/jobs/{SAMPLE_JOB['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


# Verifies deleting unknown job returns HTTP 404.
def test_delete_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete("/jobs/nonexistent-id", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 404


# Verifies delete query includes user ownership filter.
def test_delete_job_scoped_to_user():
    """Delete must filter by user_id so users cannot delete each other's jobs."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.delete(f"/jobs/{SAMPLE_JOB['id']}", headers={"authorization": AUTH_HEADER})
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# Document routes
# ---------------------------------------------------------------------------


def test_list_documents_requires_auth():
    response = client.get("/documents")
    assert response.status_code == 401


def test_get_document_requires_auth():
    response = client.get(f"/documents/{SAMPLE_DOCUMENT['id']}")
    assert response.status_code == 401


def test_update_document_requires_auth():
    response = client.put(
        f"/documents/{SAMPLE_DOCUMENT['id']}",
        json={"name": "Updated Draft"},
    )
    assert response.status_code == 401


def test_delete_document_requires_auth():
    response = client.delete(f"/documents/{SAMPLE_DOCUMENT['id']}")
    assert response.status_code == 401


def test_create_document_requires_auth():
    response = client.post(
        "/documents",
        data={"name": "Draft", "doc_type": "Cover Letter Draft"},
        files={
            "file": (
                "draft.pdf",
                b"%PDF-1.7\nDraft content",
                "application/pdf",
            )
        },
    )
    assert response.status_code == 401


def test_list_documents_returns_user_documents():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/documents", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == SAMPLE_DOCUMENT["id"]
    assert body[0]["name"] == SAMPLE_DOCUMENT["name"]


def test_get_document_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/documents/{SAMPLE_DOCUMENT['id']}", headers={"authorization": AUTH_HEADER}
        )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == SAMPLE_DOCUMENT["id"]
    assert body["job_id"] == SAMPLE_JOB["id"]


def test_get_document_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/documents/nonexistent-id",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_get_document_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(f"/documents/{SAMPLE_DOCUMENT['id']}", headers={"authorization": AUTH_HEADER})
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


def test_create_document_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={
                "name": "Datadog_Backend_Engineer_Draft",
                "doc_type": "Cover Letter Draft",
                "job_id": SAMPLE_JOB["id"],
            },
            files={
                "file": (
                    "draft.pdf",
                    b"%PDF-1.7\nDraft content",
                    "application/pdf",
                )
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["job_id"] == SAMPLE_JOB["id"]


def test_create_document_from_job_context_inserts_linked_job_id():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([SAMPLE_JOB], [SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={
                "name": "Datadog_Backend_Engineer_Draft",
                "doc_type": "Cover Letter Draft",
                "job_id": SAMPLE_JOB["id"],
            },
            files={
                "file": (
                    "draft.pdf",
                    b"%PDF-1.7\nDraft content",
                    "application/pdf",
                )
            },
            headers={"authorization": AUTH_HEADER},
        )

    assert response.status_code == 201
    inserted_payload = mock_query.insert.call_args[0][0]
    assert inserted_payload["job_id"] == SAMPLE_JOB["id"]
    assert inserted_payload["user_id"] == MOCK_USER_ID


def test_create_document_sets_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/documents",
            data={"name": "Draft"},
            files={
                "file": (
                    "draft.pdf",
                    b"%PDF-1.7\nDraft content",
                    "application/pdf",
                )
            },
            headers={"authorization": AUTH_HEADER},
        )
    inserted_payload = mock_query.insert.call_args[0][0]
    assert inserted_payload["user_id"] == MOCK_USER_ID


def test_create_document_rejects_blank_name():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={"name": "   "},
            files={
                "file": (
                    "draft.pdf",
                    b"%PDF-1.7\nDraft content",
                    "application/pdf",
                )
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "name must not be blank" in response.json()["detail"]


def test_create_document_rejects_unsupported_extension():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={"name": "Draft"},
            files={"file": ("draft.exe", b"Draft content", "application/octet-stream")},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "Only PDF files are supported" in response.json()["detail"]


def test_create_document_rejects_non_pdf_content_with_pdf_extension():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={"name": "Draft"},
            files={"file": ("draft.pdf", b"Not a PDF", "application/pdf")},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "Uploaded file is not a valid PDF" in response.json()["detail"]


def test_update_document_success():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_DOCUMENT], [SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/documents/{SAMPLE_DOCUMENT['id']}",
            json={"name": "Updated Draft"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 405


def test_update_document_not_found():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/documents/nonexistent-id",
            json={"name": "Updated Draft"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 405


def test_update_document_rejects_empty_payload():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/documents/{SAMPLE_DOCUMENT['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 405


def test_create_document_rejects_unknown_linked_job():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/documents",
            data={"name": "Draft", "job_id": "missing-job-id"},
            files={
                "file": (
                    "draft.pdf",
                    b"%PDF-1.7\nBody",
                    "application/pdf",
                )
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404
    assert response.json()["detail"] == "Linked job not found"


def test_document_update_all_optional():
    document = DocumentUpdate()
    assert document.name is None
    assert document.doc_type is None
    assert document.job_id is None


def test_get_document_view_url_success():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/documents/{SAMPLE_DOCUMENT['id']}/view-url",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["url"].startswith("https://")


def test_get_document_view_url_uses_15_minute_expiry():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get(
            f"/documents/{SAMPLE_DOCUMENT['id']}/view-url",
            headers={"authorization": AUTH_HEADER},
        )
    storage_obj = mock_sb.storage.from_.return_value
    storage_obj.create_signed_url.assert_called_with(SAMPLE_DOCUMENT["storage_path"], 900)


def test_get_document_view_url_not_found():
    mock_sb, _ = _make_mock_sb_with_side_effects([])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/documents/nonexistent-id/view-url",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_delete_document_success():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_DOCUMENT], [SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/documents/{SAMPLE_DOCUMENT['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_document_returns_500_when_delete_query_fails():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    mock_query.execute.side_effect = [
        MagicMock(data=[SAMPLE_DOCUMENT]),
        APIError({"message": "db down", "code": "500", "hint": None, "details": None}),
    ]
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/documents/{SAMPLE_DOCUMENT['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to delete document"


def test_delete_document_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            "/documents/nonexistent-id",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_delete_document_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_DOCUMENT])
    with patch("main.get_supabase", return_value=mock_sb):
        client.delete(
            f"/documents/{SAMPLE_DOCUMENT['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# Pydantic schema validation
# ---------------------------------------------------------------------------


# Verifies JobCreate model applies default optional values.
def test_job_create_defaults():
    job = JobCreate(title="Engineer", company="Acme")
    assert job.status == "applied"
    assert job.location is None
    assert job.applied_date is None
    assert job.deadline is None
    assert job.description is None
    assert job.notes is None
    assert job.recruiter_notes is None


# Verifies JobCreate model accepts and stores all provided fields.
def test_job_create_all_fields():
    job = JobCreate(
        title="Backend Engineer",
        company="TechCorp",
        location="Remote",
        status="interviewing",
        applied_date=date(2026, 3, 1),
        deadline=date(2026, 4, 15),
        description="Build APIs",
        notes="Referral from alumni",
        recruiter_notes="Recruiter: Alex",
    )
    assert job.status == "interviewing"
    assert job.location == "Remote"
    assert job.deadline == date(2026, 4, 15)
    assert job.recruiter_notes == "Recruiter: Alex"


def test_job_create_accepts_final_outcome_statuses():
    for status in ("accepted", "declined", "withdrawn"):
        job = JobCreate(title="Backend Engineer", company="TechCorp", status=status)
        assert job.status == status


def test_job_statuses_constant_includes_new_final_outcomes():
    assert {"accepted", "declined", "withdrawn"}.issubset(JOB_STATUSES)


# Verifies JobUpdate model allows all fields to remain optional.
def test_job_update_all_optional():
    job = JobUpdate()
    assert job.title is None
    assert job.company is None
    assert job.status is None
    assert job.location is None


def test_interview_event_create_requires_round_type_and_datetime():
    event = InterviewEventCreate(
        round_type="Phone Screen", scheduled_at="2026-05-10T15:00:00+00:00"
    )
    assert event.round_type == "Phone Screen"
    assert event.notes is None


def test_interview_event_update_all_optional():
    event = InterviewEventUpdate()
    assert event.round_type is None
    assert event.scheduled_at is None
    assert event.notes is None


# ---------------------------------------------------------------------------
# Profile fixtures
# ---------------------------------------------------------------------------

SAMPLE_PROFILE = {
    "id": "profile-uuid-9999",
    "user_id": MOCK_USER_ID,
    "full_name": "Jane Smith",
    "headline": "Software Engineer",
    "location": "New York, NY",
    "phone": "555-123-4567",
    "website": "https://janesmith.dev",
    "linkedin_url": "https://linkedin.com/in/janesmith",
    "github_url": "https://github.com/janesmith",
    "summary": "Experienced engineer with 5 years in backend development.",
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}


# ---------------------------------------------------------------------------
# Auth guard — profile routes must reject requests with no token
# ---------------------------------------------------------------------------


# Verifies profile read endpoint requires authentication.
def test_get_profile_requires_auth():
    response = client.get("/profile")
    assert response.status_code == 401


# Verifies profile upsert endpoint requires authentication.
def test_put_profile_requires_auth():
    response = client.put("/profile", json={"full_name": "Jane"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------


# Verifies existing profile is returned with completion metadata.
def test_get_profile_returns_existing_profile():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/profile", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["full_name"] == "Jane Smith"
    assert body["profile"]["headline"] == "Software Engineer"
    assert body["profile"]["user_id"] == MOCK_USER_ID
    assert body["completion"]["completion_percentage"] == 100
    assert body["completion"]["is_complete"] is True
    assert body["completion"]["missing_fields"] == []
    assert body["completion"]["required_count"] == 6


# Verifies missing profile returns empty profile and zero completion.
def test_get_profile_returns_empty_when_no_profile():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/profile", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["profile"] == {}
    assert body["completion"]["completion_percentage"] == 0
    assert body["completion"]["is_complete"] is False
    assert body["completion"]["missing_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert body["completion"]["required_count"] == 6


# Verifies profile query is scoped to authenticated user_id.
def test_get_profile_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/profile", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# Verifies profile query requests all columns from storage.
def test_get_profile_selects_all_fields():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/profile", headers={"authorization": AUTH_HEADER})
    mock_query.select.assert_called_with("*")


# ---------------------------------------------------------------------------
# PUT /profile
# ---------------------------------------------------------------------------


# Verifies profile upsert succeeds and returns saved profile data.
def test_upsert_profile_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/profile",
            json={"full_name": "Jane Smith", "headline": "Software Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["full_name"] == "Jane Smith"
    assert body["completion"]["completion_percentage"] == 100
    assert body["completion"]["is_complete"] is True
    assert body["completion"]["missing_fields"] == []


# Verifies user_id is injected during profile upsert operations.
def test_upsert_profile_injects_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/profile",
            json={"full_name": "Jane"},
            headers={"authorization": AUTH_HEADER},
        )
    upserted = mock_query.upsert.call_args[0][0]
    assert upserted["user_id"] == MOCK_USER_ID


# Verifies profile upsert uses user_id conflict target.
def test_upsert_profile_uses_on_conflict_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/profile",
            json={"full_name": "Jane"},
            headers={"authorization": AUTH_HEADER},
        )
    kwargs = mock_query.upsert.call_args[1]
    assert kwargs.get("on_conflict") == "user_id"


# Verifies upsert payload includes every provided profile field.
def test_upsert_profile_sends_all_fields():
    """All provided ProfileUpsert fields are included in the upsert payload."""
    all_fields = {
        "full_name": "Jane Smith",
        "headline": "Software Engineer",
        "location": "New York, NY",
        "phone": "555-123-4567",
        "website": "https://janesmith.dev",
        "linkedin_url": "https://linkedin.com/in/janesmith",
        "github_url": "https://github.com/janesmith",
        "summary": "Experienced engineer.",
    }
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/profile",
            json=all_fields,
            headers={"authorization": AUTH_HEADER},
        )
    upserted = mock_query.upsert.call_args[0][0]
    for field in all_fields:
        assert field in upserted


# Verifies profile upsert returns 500 when database write fails.
def test_upsert_profile_db_failure_returns_500():
    mock_sb, _, mock_result = make_mock_sb(data=[])
    mock_result.data = []
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/profile",
            json={"full_name": "Jane"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500


# Verifies partial profile updates exclude unspecified fields.
def test_upsert_profile_partial_fields():
    """Only provided fields are sent; unprovided fields are excluded from payload."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/profile",
            json={"summary": "Updated summary"},
            headers={"authorization": AUTH_HEADER},
        )
    upserted = mock_query.upsert.call_args[0][0]
    assert upserted["summary"] == "Updated summary"
    assert "full_name" not in upserted


# Verifies explicit null can clear a stored profile field.
def test_upsert_profile_can_clear_field():
    """Sending null for a field explicitly sets it to None in the payload."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/profile",
            json={"full_name": None},
            headers={"authorization": AUTH_HEADER},
        )
    upserted = mock_query.upsert.call_args[0][0]
    assert upserted["full_name"] is None


# ---------------------------------------------------------------------------
# Profile completion helper unit tests
# ---------------------------------------------------------------------------


# Verifies completion helper output for an empty profile object.
def test_get_profile_completion_empty_profile():
    completion = get_profile_completion({})
    assert set(completion.keys()) == {
        "required_fields",
        "completed_fields",
        "missing_fields",
        "completed_count",
        "required_count",
        "completion_percentage",
        "is_complete",
    }
    assert completion["required_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["completed_fields"] == []
    assert completion["missing_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["completed_count"] == 0
    assert completion["required_count"] == 6
    assert completion["completion_percentage"] == 0
    assert completion["is_complete"] is False


# Verifies completion helper output for fully populated profile.
def test_get_profile_completion_fully_populated_profile():
    completion = get_profile_completion(SAMPLE_PROFILE)
    assert completion["required_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["completed_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["missing_fields"] == []
    assert completion["completed_count"] == 6
    assert completion["required_count"] == 6
    assert completion["completion_percentage"] == 100
    assert completion["is_complete"] is True


# Verifies profile value normalization handles blank/non-string inputs.
def test_normalize_profile_value_edge_cases():
    assert _normalize_profile_value("   ") == ""
    assert _normalize_profile_value("") == ""
    assert _normalize_profile_value(None) == ""
    assert _normalize_profile_value(123) == ""


# ---------------------------------------------------------------------------
# ProfileUpsert schema validation
# ---------------------------------------------------------------------------


# Verifies ProfileUpsert schema initializes optional fields to None.
def test_profile_upsert_all_optional():
    profile = ProfileUpsert()
    assert profile.full_name is None
    assert profile.headline is None
    assert profile.location is None
    assert profile.phone is None
    assert profile.website is None
    assert profile.linkedin_url is None
    assert profile.github_url is None
    assert profile.summary is None


# Verifies ProfileUpsert schema stores all provided field values.
def test_profile_upsert_all_fields():
    profile = ProfileUpsert(
        full_name="Jane Smith",
        headline="Software Engineer",
        location="New York, NY",
        phone="555-123-4567",
        website="https://janesmith.dev",
        linkedin_url="https://linkedin.com/in/janesmith",
        github_url="https://github.com/janesmith",
        summary="Experienced engineer.",
    )
    assert profile.full_name == "Jane Smith"
    assert profile.headline == "Software Engineer"
    assert profile.summary == "Experienced engineer."


# ---------------------------------------------------------------------------
# Experience fixtures
# ---------------------------------------------------------------------------


SAMPLE_EXPERIENCE = {
    "id": "exp-uuid-1111",
    "user_id": MOCK_USER_ID,
    "title": "Software Engineer",
    "company": "TechCorp",
    "location": "Remote",
    "start_year": 2020,
    "end_year": 2023,
    "description": "Built backend services.",
    "position": 0,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

# ---------------------------------------------------------------------------
# Auth guards — every experience route must reject requests with no token
# ---------------------------------------------------------------------------


def test_list_experience_requires_auth():
    response = client.get("/experience")
    assert response.status_code == 401


def test_create_experience_requires_auth():
    response = client.post(
        "/experience", json={"title": "Engineer", "company": "Acme", "start_year": 2020}
    )
    assert response.status_code == 401


def test_reorder_experience_requires_auth():
    response = client.put("/experience/reorder", json={"ids": []})
    assert response.status_code == 401


def test_update_experience_requires_auth():
    response = client.put("/experience/some-uuid", json={"title": "Senior Engineer"})
    assert response.status_code == 401


def test_delete_experience_requires_auth():
    response = client.delete("/experience/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /experience
# ---------------------------------------------------------------------------


def test_list_experience_returns_entries():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/experience", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == SAMPLE_EXPERIENCE["id"]
    assert body[0]["company"] == "TechCorp"


def test_list_experience_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/experience", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


def test_list_experience_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/experience", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# POST /experience
# ---------------------------------------------------------------------------


def test_create_experience_success():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/experience",
            json={
                "title": "Software Engineer",
                "company": "TechCorp",
                "start_year": 2020,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["title"] == "Software Engineer"


def test_create_experience_sets_user_id():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/experience",
            json={"title": "Engineer", "company": "Acme", "start_year": 2020},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["user_id"] == MOCK_USER_ID


def test_create_experience_sets_position_from_max():
    """position is max existing position + 1, fetched via order+limit."""
    mock_sb, mock_query = _make_mock_sb_with_side_effects([{"position": 2}], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/experience",
            json={"title": "Engineer", "company": "Acme", "start_year": 2020},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["position"] == 3


def test_create_experience_missing_title_returns_422():
    response = client.post(
        "/experience",
        json={"company": "Acme", "start_year": 2020},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_experience_missing_company_returns_422():
    response = client.post(
        "/experience",
        json={"title": "Engineer", "start_year": 2020},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_experience_blank_title_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/experience",
            json={"title": "   ", "company": "Acme", "start_year": 2020},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "title" in response.json()["detail"]


def test_create_experience_invalid_start_year_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/experience",
            json={"title": "Engineer", "company": "Acme", "start_year": 1800},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "start_year" in response.json()["detail"]


def test_create_experience_end_year_before_start_year_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/experience",
            json={
                "title": "Engineer",
                "company": "Acme",
                "start_year": 2020,
                "end_year": 2019,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "end_year" in response.json()["detail"]


def test_create_experience_trims_title_before_insert():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/experience",
            json={
                "title": "  Software Engineer  ",
                "company": "Acme",
                "start_year": 2020,
            },
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["title"] == "Software Engineer"


def test_create_experience_blank_location_stored_as_null():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/experience",
            json={
                "title": "Engineer",
                "company": "Acme",
                "start_year": 2020,
                "location": "   ",
            },
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload.get("location") is None


def test_create_experience_retries_on_position_conflict():
    """If the first insert fails (e.g. UNIQUE position conflict), a second
    attempt re-reads max position and retries the insert."""
    # side-effects: position_read_1 → insert_fail → position_read_2 → insert_ok
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [],  # first position read: no existing rows → position 0
        None,  # first insert: fails (simulates unique constraint violation)
        [],  # second position read: still no rows (race resolved)
        [SAMPLE_EXPERIENCE],  # second insert: succeeds
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/experience",
            json={"title": "Engineer", "company": "Acme", "start_year": 2020},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["title"] == "Software Engineer"


# ---------------------------------------------------------------------------
# PUT /experience/reorder
# ---------------------------------------------------------------------------


def test_reorder_experience_success():
    exp2 = {
        **SAMPLE_EXPERIENCE,
        "id": "exp-uuid-2222",
        "title": "Senior Engineer",
        "position": 1,
    }
    reordered = [{**exp2, "position": 0}, {**SAMPLE_EXPERIENCE, "position": 1}]
    # 1 full-row select(*) + 1 temp upsert + 1 final upsert + 1 final select(*)
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [exp2, SAMPLE_EXPERIENCE],
        None,
        None,
        reordered,
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/experience/reorder",
            json={"ids": [exp2["id"], SAMPLE_EXPERIENCE["id"]]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["title"] == "Senior Engineer"
    assert body[1]["title"] == "Software Engineer"


def test_reorder_experience_empty_ids():
    mock_sb, _ = _make_mock_sb_with_side_effects([])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/experience/reorder",
            json={"ids": []},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json() == []


def test_reorder_experience_mismatched_ids_returns_400():
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [{"id": SAMPLE_EXPERIENCE["id"]}],
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/experience/reorder",
            json={"ids": ["wrong-id"]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


def test_reorder_experience_duplicate_ids_returns_400():
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [{"id": SAMPLE_EXPERIENCE["id"]}],
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/experience/reorder",
            json={"ids": [SAMPLE_EXPERIENCE["id"], SAMPLE_EXPERIENCE["id"]]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# PUT /experience/{entry_id}
# ---------------------------------------------------------------------------


def test_update_experience_success():
    updated = {**SAMPLE_EXPERIENCE, "title": "Staff Engineer"}
    # select existing + update
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_EXPERIENCE], [updated])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={"title": "Staff Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["title"] == "Staff Engineer"


def test_update_experience_not_found():
    mock_sb, _ = _make_mock_sb_with_side_effects([])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/experience/nonexistent-id",
            json={"title": "Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_experience_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


def test_update_experience_blank_title_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_EXPERIENCE], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={"title": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "title" in response.json()["detail"]


def test_update_experience_partial_end_year_before_existing_start_year_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_EXPERIENCE], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={"end_year": SAMPLE_EXPERIENCE["start_year"] - 1},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "end_year" in response.json()["detail"]


def test_update_experience_required_field_null_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([SAMPLE_EXPERIENCE], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={"title": None},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "title" in response.json()["detail"]


def test_update_experience_scoped_to_user():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([SAMPLE_EXPERIENCE], [SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            json={"title": "Staff Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# DELETE /experience/{entry_id}
# ---------------------------------------------------------------------------


def test_delete_experience_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_experience_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            "/experience/nonexistent-id", headers={"authorization": AUTH_HEADER}
        )
    assert response.status_code == 404


def test_delete_experience_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_EXPERIENCE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.delete(
            f"/experience/{SAMPLE_EXPERIENCE['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# ExperienceCreate / ExperienceUpdate / ExperienceReorder schema tests
# ---------------------------------------------------------------------------


def test_experience_create_requires_title():
    with pytest.raises(ValidationError):
        ExperienceCreate(company="Acme", start_year=2020)


def test_experience_create_requires_company():
    with pytest.raises(ValidationError):
        ExperienceCreate(title="Engineer", start_year=2020)


def test_experience_create_requires_start_year():
    with pytest.raises(ValidationError):
        ExperienceCreate(title="Engineer", company="Acme")


def test_experience_update_all_optional():
    entry = ExperienceUpdate()
    assert entry.title is None
    assert entry.company is None
    assert entry.start_year is None
    assert entry.end_year is None
    assert entry.location is None
    assert entry.description is None


def test_experience_reorder_has_ids():
    reorder = ExperienceReorder(ids=["a", "b"])
    assert reorder.ids == ["a", "b"]


# ---------------------------------------------------------------------------
# Reminder fixtures
# ---------------------------------------------------------------------------

FUTURE_DUE_DATE = (date.today() + timedelta(days=7)).isoformat()
PAST_DUE_DATE = (date.today() - timedelta(days=1)).isoformat()
TODAY_DUE_DATE = date.today().isoformat()

SAMPLE_REMINDER = {
    "id": "reminder-uuid-1111",
    "job_id": SAMPLE_JOB["id"],
    "user_id": MOCK_USER_ID,
    "title": "Follow up on offer",
    "notes": "Ask about start date",
    "due_date": f"{FUTURE_DUE_DATE}T09:00:00+00:00",
    "completed_at": None,
    "created_at": "2026-04-14T00:00:00+00:00",
    "jobs": {"title": "Backend Engineer", "company": "TechCorp"},
}


# ---------------------------------------------------------------------------
# Auth guard — reminder routes must reject requests with no token
# ---------------------------------------------------------------------------


def test_list_reminders_requires_auth():
    response = client.get("/reminders")
    assert response.status_code == 401


def test_create_reminder_requires_auth():
    response = client.post(
        "/reminders",
        json={
            "job_id": SAMPLE_JOB["id"],
            "title": "Follow up",
            "due_date": FUTURE_DUE_DATE,
        },
    )
    assert response.status_code == 401


def test_update_reminder_requires_auth():
    response = client.put("/reminders/some-uuid", json={"title": "Updated"})
    assert response.status_code == 401


def test_delete_reminder_requires_auth():
    response = client.delete("/reminders/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /reminders
# ---------------------------------------------------------------------------


def test_list_reminders_returns_user_reminders():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_REMINDER])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/reminders", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == SAMPLE_REMINDER["id"]
    assert body[0]["title"] == "Follow up on offer"


def test_list_reminders_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/reminders", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


def test_list_reminders_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_REMINDER])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/reminders", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# POST /reminders
# ---------------------------------------------------------------------------


def _make_mock_sb_for_reminder_create(reminder_data=None, job_exists=True):
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    job_result = MagicMock()
    job_result.data = [SAMPLE_JOB] if job_exists else []

    insert_result = MagicMock()
    insert_result.data = [reminder_data] if reminder_data else []

    mock_query = MagicMock()
    for method in ("select", "insert", "update", "delete", "eq", "order"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = [job_result, insert_result]

    mock_sb.table.return_value = mock_query
    return mock_sb, mock_query


def test_create_reminder_success():
    mock_sb, _ = _make_mock_sb_for_reminder_create(reminder_data=SAMPLE_REMINDER)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/reminders",
            json={
                "job_id": SAMPLE_JOB["id"],
                "title": "Follow up on offer",
                "due_date": f"{FUTURE_DUE_DATE}T09:00:00+00:00",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["title"] == "Follow up on offer"


def test_create_reminder_job_not_found_returns_404():
    mock_sb, _ = _make_mock_sb_for_reminder_create(job_exists=False)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/reminders",
            json={
                "job_id": "nonexistent-job-id",
                "title": "Follow up",
                "due_date": f"{FUTURE_DUE_DATE}T09:00:00+00:00",
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_create_reminder_missing_title_returns_422():
    response = client.post(
        "/reminders",
        json={"job_id": SAMPLE_JOB["id"], "due_date": FUTURE_DUE_DATE},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_reminder_missing_due_date_returns_422():
    response = client.post(
        "/reminders",
        json={"job_id": SAMPLE_JOB["id"], "title": "Follow up"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_reminder_sets_user_id():
    mock_sb, mock_query = _make_mock_sb_for_reminder_create(reminder_data=SAMPLE_REMINDER)
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/reminders",
            json={
                "job_id": SAMPLE_JOB["id"],
                "title": "Follow up",
                "due_date": f"{FUTURE_DUE_DATE}T09:00:00+00:00",
            },
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["user_id"] == MOCK_USER_ID


def test_create_reminder_rejects_past_due_date():
    mock_sb, mock_query = _make_mock_sb_for_reminder_create(reminder_data=SAMPLE_REMINDER)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/reminders",
            json={
                "job_id": SAMPLE_JOB["id"],
                "title": "Follow up",
                "due_date": PAST_DUE_DATE,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "past" in response.json()["detail"].lower()
    mock_query.insert.assert_not_called()


def test_create_reminder_accepts_today():
    reminder_today = {**SAMPLE_REMINDER, "due_date": f"{TODAY_DUE_DATE}T09:00:00+00:00"}
    mock_sb, _ = _make_mock_sb_for_reminder_create(reminder_data=reminder_today)
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/reminders",
            json={
                "job_id": SAMPLE_JOB["id"],
                "title": "Follow up",
                "due_date": TODAY_DUE_DATE,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# PUT /reminders/{id}
# ---------------------------------------------------------------------------


def test_update_reminder_success():
    updated = {**SAMPLE_REMINDER, "title": "Updated title"}
    mock_sb, _, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            json={"title": "Updated title"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"


def test_update_reminder_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/reminders/nonexistent-id",
            json={"title": "Updated"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_reminder_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb()
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


def test_update_reminder_mark_complete():
    completed = {**SAMPLE_REMINDER, "completed_at": "2026-04-14T10:00:00+00:00"}
    mock_sb, mock_query, _ = make_mock_sb(data=[completed])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            json={"completed_at": "2026-04-14T10:00:00+00:00"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["completed_at"] == "2026-04-14T10:00:00+00:00"


def test_update_reminder_rejects_past_due_date():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_REMINDER])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            json={"due_date": PAST_DUE_DATE},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "past" in response.json()["detail"].lower()
    mock_query.update.assert_not_called()


def test_update_reminder_allows_completed_at_without_due_date():
    completed = {**SAMPLE_REMINDER, "completed_at": "2026-04-21T10:00:00+00:00"}
    mock_sb, _, _ = make_mock_sb(data=[completed])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            json={"completed_at": "2026-04-21T10:00:00+00:00"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# DELETE /reminders/{id}
# ---------------------------------------------------------------------------


def test_delete_reminder_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_REMINDER])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_reminder_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            "/reminders/nonexistent-id",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_delete_reminder_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_REMINDER])
    with patch("main.get_supabase", return_value=mock_sb):
        client.delete(
            f"/reminders/{SAMPLE_REMINDER['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# ReminderCreate / ReminderUpdate schema validation
# ---------------------------------------------------------------------------


def test_reminder_create_requires_job_id_title_due_date():
    reminder = ReminderCreate(
        job_id=SAMPLE_JOB["id"], title="Follow up", due_date="2026-04-20T09:00:00+00:00"
    )
    assert reminder.job_id == SAMPLE_JOB["id"]
    assert reminder.title == "Follow up"
    assert reminder.notes is None


def test_reminder_update_all_optional():
    reminder = ReminderUpdate()
    assert reminder.title is None
    assert reminder.notes is None
    assert reminder.due_date is None
    assert reminder.completed_at is None


# ---------------------------------------------------------------------------
# Career preferences fixtures
# ---------------------------------------------------------------------------

SAMPLE_PREFS = {
    "id": "prefs-uuid-1111",
    "user_id": MOCK_USER_ID,
    "target_roles": "Software Engineer",
    "preferred_locations": "New York, NY",
    "work_mode": "hybrid",
    "salary_min": 80000,
    "salary_max": 120000,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}


# ---------------------------------------------------------------------------
# Auth guard — career preferences routes must reject requests with no token
# ---------------------------------------------------------------------------


def test_get_career_preferences_requires_auth():
    response = client.get("/career-preferences")
    assert response.status_code == 401


def test_put_career_preferences_requires_auth():
    response = client.put("/career-preferences", json={"target_roles": "Engineer"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /career-preferences
# ---------------------------------------------------------------------------


def test_get_career_preferences_returns_existing():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/career-preferences", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert body["work_mode"] == "hybrid"
    assert body["salary_min"] == 80000
    assert body["salary_max"] == 120000


def test_get_career_preferences_returns_empty_when_none():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/career-preferences", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == {}


def test_get_career_preferences_returns_500_on_db_failure():
    mock_sb, _, mock_result = make_mock_sb(data=None)
    mock_result.data = None
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/career-preferences", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 500


def test_get_career_preferences_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/career-preferences", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# PUT /career-preferences
# ---------------------------------------------------------------------------


def test_put_career_preferences_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"target_roles": "Software Engineer", "work_mode": "hybrid"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["work_mode"] == "hybrid"


def test_put_career_preferences_injects_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/career-preferences",
            json={"target_roles": "Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    upserted = mock_query.upsert.call_args[0][0]
    assert upserted["user_id"] == MOCK_USER_ID


def test_put_career_preferences_uses_on_conflict_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            "/career-preferences",
            json={"target_roles": "Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    kwargs = mock_query.upsert.call_args[1]
    assert kwargs.get("on_conflict") == "user_id"


def test_put_career_preferences_rejects_invalid_work_mode():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"work_mode": "invalid"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_put_career_preferences_allows_null_work_mode():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"work_mode": None},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200


def test_put_career_preferences_rejects_negative_salary_min():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"salary_min": -1},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_put_career_preferences_rejects_negative_salary_max():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_PREFS])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"salary_max": -500},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_put_career_preferences_rejects_min_greater_than_max():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"salary_min": 120000, "salary_max": 80000},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_put_career_preferences_rejects_partial_update_violating_range():
    """Updating only salary_max below an existing salary_min must fail."""
    existing = {**SAMPLE_PREFS, "salary_min": 80000, "salary_max": 120000}
    mock_sb = MagicMock()
    mock_user_resp = MagicMock()
    mock_user_resp.user.id = MOCK_USER_ID
    mock_sb.auth.get_user.return_value = mock_user_resp

    select_result = MagicMock()
    select_result.data = [existing]

    upsert_result = MagicMock()
    upsert_result.data = [existing]

    mock_query = MagicMock()
    for method in ("select", "insert", "update", "delete", "upsert", "eq", "order"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = [select_result, upsert_result]

    mock_sb.table.return_value = mock_query

    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"salary_max": 60000},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_put_career_preferences_db_failure_returns_500():
    mock_sb, _, mock_result = make_mock_sb(data=[])
    mock_result.data = []
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/career-preferences",
            json={"target_roles": "Engineer"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# CareerPreferencesUpsert schema validation
# ---------------------------------------------------------------------------


def test_career_preferences_upsert_all_optional():
    prefs = CareerPreferencesUpsert()
    assert prefs.target_roles is None
    assert prefs.preferred_locations is None
    assert prefs.work_mode is None
    assert prefs.salary_min is None
    assert prefs.salary_max is None


def test_career_preferences_upsert_all_fields():
    prefs = CareerPreferencesUpsert(
        target_roles="Software Engineer",
        preferred_locations="New York, NY",
        work_mode="remote",
        salary_min=80000,
        salary_max=120000,
    )
    assert prefs.target_roles == "Software Engineer"
    assert prefs.work_mode == "remote"
    assert prefs.salary_min == 80000
    assert prefs.salary_max == 120000


# Skills fixtures
# ---------------------------------------------------------------------------

SAMPLE_SKILL = {
    "id": "skill-uuid-1111",
    "user_id": MOCK_USER_ID,
    "name": "React",
    "category": "Frontend",
    "proficiency": "advanced",
    "position": 0,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

# ---------------------------------------------------------------------------
# Auth guard — every skills route must reject requests with no token
# ---------------------------------------------------------------------------


def test_list_skills_requires_auth():
    response = client.get("/skills")
    assert response.status_code == 401


def test_create_skill_requires_auth():
    response = client.post("/skills", json={"name": "React"})
    assert response.status_code == 401


def test_reorder_skills_requires_auth():
    response = client.put("/skills/reorder", json={"ids": []})
    assert response.status_code == 401


def test_update_skill_requires_auth():
    response = client.put("/skills/some-uuid", json={"name": "Vue"})
    assert response.status_code == 401


def test_delete_skill_requires_auth():
    response = client.delete("/skills/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /skills
# ---------------------------------------------------------------------------


def test_list_skills_returns_user_skills():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/skills", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "React"
    assert body[0]["category"] == "Frontend"


def test_list_skills_returns_empty_list():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/skills", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


def test_list_skills_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/skills", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


def test_list_skills_data_none_returns_500():
    mock_sb, _, mock_result = make_mock_sb(data=[])
    mock_result.data = None
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/skills", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# POST /skills
# ---------------------------------------------------------------------------


def test_create_skill_success():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/skills",
            json={"name": "React", "category": "Frontend", "proficiency": "advanced"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["name"] == "React"


def test_create_skill_sets_user_id():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/skills",
            json={"name": "React"},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["user_id"] == MOCK_USER_ID


def test_create_skill_sets_position_from_count():
    """position is max existing position + 1, fetched via order+limit."""
    # The query returns only the highest-position row (order desc, limit 1).
    mock_sb, mock_query = _make_mock_sb_with_side_effects([{"position": 1}], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/skills",
            json={"name": "React"},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["position"] == 2


def test_create_skill_invalid_proficiency_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/skills",
            json={"name": "React", "proficiency": "invalid"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_create_skill_missing_name_returns_422():
    response = client.post(
        "/skills",
        json={"category": "Frontend"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_skill_blank_name_returns_422():
    mock_sb, _ = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/skills",
            json={"name": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "name" in response.json()["detail"]


def test_create_skill_trims_name_before_insert():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/skills",
            json={"name": "  React  "},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["name"] == "React"


def test_create_skill_blank_category_stored_as_null():
    mock_sb, mock_query = _make_mock_sb_with_side_effects([], [SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/skills",
            json={"name": "React", "category": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload.get("category") is None


def test_create_skill_db_failure_returns_500():
    # insert returns empty data on both attempts (position read + insert, retried once)
    mock_sb, _ = _make_mock_sb_with_side_effects([], [], [], [])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/skills",
            json={"name": "React"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# PUT /skills/reorder
# ---------------------------------------------------------------------------


def test_reorder_skills_success():
    skill2 = {**SAMPLE_SKILL, "id": "skill-uuid-2222", "name": "Python", "position": 1}
    reordered = [{**skill2, "position": 0}, {**SAMPLE_SKILL, "position": 1}]
    # 1 full-row select(*) + 1 temp upsert + 1 final upsert + 1 final select(*)
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [skill2, SAMPLE_SKILL],
        None,
        None,
        reordered,
    )
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/skills/reorder",
            json={"ids": [skill2["id"], SAMPLE_SKILL["id"]]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["name"] == "Python"
    assert body[1]["name"] == "React"


def test_reorder_skills_empty_ids():
    # select existing (empty), skip upsert, reconstruct locally
    mock_sb, _ = _make_mock_sb_with_side_effects([])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/skills/reorder",
            json={"ids": []},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# PUT /skills/{skill_id}
# ---------------------------------------------------------------------------


def test_update_skill_success():
    updated = {**SAMPLE_SKILL, "name": "Vue"}
    mock_sb, _, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"name": "Vue"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["name"] == "Vue"


def test_update_skill_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/skills/nonexistent-id",
            json={"name": "Vue"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_skill_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


def test_update_skill_blank_name_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"name": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "name" in response.json()["detail"]


def test_update_skill_trims_name_before_update():
    updated = {**SAMPLE_SKILL, "name": "TypeScript"}
    mock_sb, mock_query, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"name": "  TypeScript  "},
            headers={"authorization": AUTH_HEADER},
        )
    update_payload = mock_query.update.call_args[0][0]
    assert update_payload["name"] == "TypeScript"


def test_update_skill_blank_category_stored_as_null():
    updated = {**SAMPLE_SKILL, "category": None}
    mock_sb, mock_query, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"category": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    update_payload = mock_query.update.call_args[0][0]
    assert update_payload["category"] is None


def test_update_skill_invalid_proficiency_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"proficiency": "invalid"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_update_skill_scoped_to_user():
    updated = {**SAMPLE_SKILL, "name": "Vue"}
    mock_sb, mock_query, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        client.put(
            f"/skills/{SAMPLE_SKILL['id']}",
            json={"name": "Vue"},
            headers={"authorization": AUTH_HEADER},
        )
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# DELETE /skills/{skill_id}
# ---------------------------------------------------------------------------


def test_delete_skill_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/skills/{SAMPLE_SKILL['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_skill_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            "/skills/nonexistent-id",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_delete_skill_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_SKILL])
    with patch("main.get_supabase", return_value=mock_sb):
        client.delete(f"/skills/{SAMPLE_SKILL['id']}", headers={"authorization": AUTH_HEADER})
    eq_calls = [call[0] for call in mock_query.eq.call_args_list]
    assert ("user_id", MOCK_USER_ID) in eq_calls


# ---------------------------------------------------------------------------
# SkillCreate / SkillUpdate / SkillReorder schema validation
# ---------------------------------------------------------------------------


def test_skill_create_requires_name():
    with pytest.raises(ValidationError):
        SkillCreate()


def test_skill_create_optional_fields():
    skill = SkillCreate(name="React")
    assert skill.name == "React"
    assert skill.category is None
    assert skill.proficiency is None


def test_skill_update_all_optional():
    skill = SkillUpdate()
    assert skill.name is None
    assert skill.category is None
    assert skill.proficiency is None


def test_skill_reorder_has_ids():
    sr = SkillReorder(ids=["a", "b", "c"])
    assert sr.ids == ["a", "b", "c"]


SAMPLE_EDUCATION = {
    "id": "edu-uuid-1111",
    "user_id": MOCK_USER_ID,
    "institution": "NJIT",
    "degree": "Bachelor of Science",
    "field_of_study": "Computer Science",
    "start_year": 2022,
    "end_year": 2026,
    "gpa": 3.8,
    "description": None,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

# ---------------------------------------------------------------------------
# Auth guard — every education route must reject requests with no token
# ---------------------------------------------------------------------------


def test_list_education_requires_auth():
    response = client.get("/education")
    assert response.status_code == 401


def test_create_education_requires_auth():
    response = client.post(
        "/education",
        json={"institution": "NJIT", "degree": "BS", "field_of_study": "CS", "start_year": 2022},
    )
    assert response.status_code == 401


def test_update_education_requires_auth():
    response = client.put("/education/some-uuid", json={"institution": "MIT"})
    assert response.status_code == 401


def test_delete_education_requires_auth():
    response = client.delete("/education/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /education
# ---------------------------------------------------------------------------


def test_list_education_returns_user_education():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/education", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["institution"] == "NJIT"
    assert body[0]["degree"] == "Bachelor of Science"


def test_list_education_returns_empty_list():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/education", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


def test_list_education_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/education", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# POST /education
# ---------------------------------------------------------------------------


def test_create_education_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "Bachelor of Science",
                "field_of_study": "Computer Science",
                "start_year": 2022,
                "end_year": 2026,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 201
    assert response.json()["institution"] == "NJIT"


def test_create_education_sets_user_id():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 2022,
            },
            headers={"authorization": AUTH_HEADER},
        )
    insert_payload = mock_query.insert.call_args[0][0]
    assert insert_payload["user_id"] == MOCK_USER_ID


def test_create_education_missing_required_fields_returns_422():
    response = client.post(
        "/education",
        json={"institution": "NJIT"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_education_invalid_start_year_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 1800,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "start_year" in response.json()["detail"]


def test_create_education_end_year_before_start_year_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 2022,
                "end_year": 2020,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "end_year" in response.json()["detail"]


def test_create_education_negative_gpa_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 2022,
                "gpa": -0.1,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_create_education_gpa_too_large_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 2022,
                "gpa": 10.0,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422


def test_create_education_db_failure_returns_500():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/education",
            json={
                "institution": "NJIT",
                "degree": "BS",
                "field_of_study": "CS",
                "start_year": 2022,
            },
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# PUT /education/{entry_id}
# ---------------------------------------------------------------------------


def test_update_education_success():
    updated = {**SAMPLE_EDUCATION, "institution": "MIT"}
    mock_sb, _, _ = make_mock_sb(data=[updated])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/education/{SAMPLE_EDUCATION['id']}",
            json={"institution": "MIT"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["institution"] == "MIT"


def test_update_education_not_found_returns_404():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/education/nonexistent-id",
            json={"institution": "MIT"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_education_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/education/{SAMPLE_EDUCATION['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


def test_update_education_required_field_null_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/education/{SAMPLE_EDUCATION['id']}",
            json={"institution": None},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "institution" in response.json()["detail"]


def test_update_education_end_year_before_start_year_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/education/{SAMPLE_EDUCATION['id']}",
            json={"start_year": 2024, "end_year": 2020},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "end_year" in response.json()["detail"]


def test_update_education_partial_end_year_before_existing_start_year_returns_422():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/education/{SAMPLE_EDUCATION['id']}",
            json={"end_year": SAMPLE_EDUCATION["start_year"] - 1},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "end_year" in response.json()["detail"]


# ---------------------------------------------------------------------------
# DELETE /education/{entry_id}
# ---------------------------------------------------------------------------


def test_delete_education_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_EDUCATION])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/education/{SAMPLE_EDUCATION['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_education_not_found_returns_404():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            "/education/nonexistent-id",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# EducationCreate / EducationUpdate schema validation
# ---------------------------------------------------------------------------


def test_education_create_requires_required_fields():
    with pytest.raises(ValidationError):
        EducationCreate(institution="NJIT")


def test_education_create_optional_fields_default_to_none():
    entry = EducationCreate(institution="NJIT", degree="BS", field_of_study="CS", start_year=2022)
    assert entry.end_year is None
    assert entry.gpa is None
    assert entry.description is None


def test_education_update_all_optional():
    entry = EducationUpdate()
    assert entry.institution is None
    assert entry.degree is None
    assert entry.start_year is None


# ---------------------------------------------------------------------------
# AI draft generation
# ---------------------------------------------------------------------------


def test_ai_generate_returns_content_from_groq():
    mock_sb = _make_mock_sb_with_side_effects(
        [SAMPLE_JOB],  # job lookup
        [{}],  # profile
        [],  # experience
        [],  # skills
        [],  # education
    )[0]
    with (
        patch("main.get_supabase", return_value=mock_sb),
        patch("main._call_groq", return_value="Generated resume content"),
    ):
        response = client.post(
            "/ai/generate",
            json={"type": "resume", "job_id": SAMPLE_JOB["id"]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["content"] == "Generated resume content"


def test_ai_generate_rejects_invalid_type():
    mock_sb, _, _ = make_mock_sb()
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/ai/generate",
            json={"type": "linkedin_post", "job_id": SAMPLE_JOB["id"]},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "resume" in response.json()["detail"]


def test_ai_rewrite_returns_rewritten_content():
    mock_sb, _, _ = make_mock_sb()
    with (
        patch("main.get_supabase", return_value=mock_sb),
        patch("main._call_groq", return_value="Rewritten cover letter"),
    ):
        response = client.post(
            "/ai/rewrite",
            json={"content": "Original draft text", "instructions": "Make it more concise"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["content"] == "Rewritten cover letter"


# ---------------------------------------------------------------------------
# AI company research
# ---------------------------------------------------------------------------


def test_ai_company_research_returns_content():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with (
        patch("main.get_supabase", return_value=mock_sb),
        patch("main._call_groq", return_value="Company research results"),
    ):
        response = client.post(
            "/ai/company-research",
            json={"job_id": SAMPLE_JOB["id"], "context": "What is the culture like?"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["content"] == "Company research results"


def test_ai_company_research_prompt_includes_job_and_context():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    captured = {}

    def capture(prompt):
        captured["prompt"] = prompt
        return "ok"

    with (
        patch("main.get_supabase", return_value=mock_sb),
        patch("main._call_groq", side_effect=capture),
    ):
        client.post(
            "/ai/company-research",
            json={"job_id": SAMPLE_JOB["id"], "context": "What tech stack do they use?"},
            headers={"authorization": AUTH_HEADER},
        )

    prompt = captured["prompt"]
    assert SAMPLE_JOB["company"] in prompt
    assert SAMPLE_JOB["title"] in prompt
    assert "What tech stack do they use?" in prompt


def test_ai_company_research_rejects_blank_context():
    mock_sb, _, _ = make_mock_sb()
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.post(
            "/ai/company-research",
            json={"job_id": SAMPLE_JOB["id"], "context": "   "},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 422
    assert "blank" in response.json()["detail"]


def test_ai_company_research_returns_404_for_unknown_job():
    mock_sb, _, _ = make_mock_sb(data=[])
    with (
        patch("main.get_supabase", return_value=mock_sb),
        patch("main._call_groq", return_value=""),
    ):
        response = client.post(
            "/ai/company-research",
            json={"job_id": "nonexistent-id", "context": "Tell me about the company."},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_ai_company_research_requires_auth():
    response = client.post(
        "/ai/company-research",
        json={"job_id": SAMPLE_JOB["id"], "context": "Tell me about the company."},
    )
    assert response.status_code in (401, 403)


def test_build_company_research_prompt_includes_key_fields():
    from main import _build_company_research_prompt

    job = {
        "company": "Acme Corp",
        "title": "Site Reliability Engineer",
        "description": "Kubernetes experience required",
    }
    prompt = _build_company_research_prompt(job, "What is the interview process like?")

    assert "Acme Corp" in prompt
    assert "Site Reliability Engineer" in prompt
    assert "Kubernetes experience required" in prompt
    assert "What is the interview process like?" in prompt


def test_build_resume_prompt_instructs_no_commentary():
    from main import _build_resume_prompt

    ctx = {"profile": {}, "experience": [], "skills": [], "education": []}
    job = {"company": "Acme", "title": "Engineer", "description": None}
    prompt = _build_resume_prompt(ctx, job)

    assert "Output only the resume" in prompt
    assert "No commentary" in prompt
