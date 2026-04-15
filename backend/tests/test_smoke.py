"""
Backend tests for jobhub.

Supabase is fully mocked — no live database or credentials required.
"""

from datetime import date
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import (
    PROFILE_REQUIRED_FIELDS,
    JobCreate,
    JobUpdate,
    ProfileUpsert,
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
    for method in ("select", "insert", "update", "delete", "upsert", "eq", "order"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.return_value = mock_result

    mock_sb.table.return_value = mock_query

    return mock_sb, mock_query, mock_result


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
    assert len(body) == 1
    assert body[0]["id"] == SAMPLE_JOB["id"]
    assert body[0]["company"] == "TechCorp"
    assert "deadline" in body[0]
    assert "recruiter_notes" in body[0]


# Verifies list endpoint returns an empty array when no jobs exist.
def test_list_jobs_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


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
    assert len(body) == 1
    assert body[0]["id"] == "job-location-match"

    with patch("main.get_supabase", return_value=mock_sb):
        status_response = client.get(
            "/jobs?q=interviewing",
            headers={"authorization": AUTH_HEADER},
        )
    assert status_response.status_code == 200
    assert status_response.json()[0]["id"] == "job-status-match"

    with patch("main.get_supabase", return_value=mock_sb):
        date_response = client.get(
            "/jobs?q=2026-03-15",
            headers={"authorization": AUTH_HEADER},
        )
    assert date_response.status_code == 200
    assert date_response.json()[0]["id"] == "job-date-match"

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
    assert len(recruiter_response.json()) == 1
    assert recruiter_response.json()[0]["id"] == "job-recruiter-match"

    with patch("main.get_supabase", return_value=mock_sb2):
        deadline_response = client.get(
            "/jobs?q=2026-07-04",
            headers={"authorization": AUTH_HEADER},
        )
    assert deadline_response.status_code == 200
    assert len(deadline_response.json()) == 1
    assert deadline_response.json()[0]["id"] == "job-deadline-match"


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
    assert len(april_resp.json()) == 1
    assert april_resp.json()[0]["id"] == "job-april-deadline"

    with patch("main.get_supabase", return_value=mock_sb):
        apr_resp = client.get(
            "/jobs?q=apr",
            headers={"authorization": AUTH_HEADER},
        )
    assert apr_resp.status_code == 200
    assert len(apr_resp.json()) == 1
    assert apr_resp.json()[0]["id"] == "job-april-deadline"

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
    assert len(y_resp.json()) == 1
    assert y_resp.json()[0]["id"] == "job-2027"

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
    assert len(d_resp.json()) == 1
    assert d_resp.json()[0]["id"] == "job-day-14"

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
    assert len(n_resp.json()) == 1
    assert n_resp.json()[0]["id"] == "job-notes-xyz"


# Verifies whitespace-only q values are treated as empty search input.
def test_list_jobs_q_ignores_whitespace_only_query():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            "/jobs?q=%20%20",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert len(response.json()) == 1


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
    assert history_payload["changed_at"] == "2026-04-01T00:00:00+00:00"


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


# Verifies JobUpdate model allows all fields to remain optional.
def test_job_update_all_optional():
    job = JobUpdate()
    assert job.title is None
    assert job.company is None
    assert job.status is None
    assert job.location is None


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
