"""
Backend tests for jobhub.

Supabase is fully mocked — no live database or credentials required.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import (
    PROFILE_REQUIRED_FIELDS,
    ExperienceCreate,
    ExperienceReorder,
    ExperienceUpdate,
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
    "description": None,
    "notes": None,
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
    for method in ("select", "insert", "update", "delete", "upsert", "eq", "order", "limit"):
        getattr(mock_query, method).return_value = mock_query
    mock_query.execute.side_effect = results

    mock_sb.table.return_value = mock_query
    return mock_sb, mock_query


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "FastAPI running on Vercel"}


# ---------------------------------------------------------------------------
# Auth guard — every job route must reject requests with no token
# ---------------------------------------------------------------------------


def test_list_jobs_requires_auth():
    response = client.get("/jobs")
    assert response.status_code == 401


def test_create_job_requires_auth():
    response = client.post("/jobs", json={"title": "Engineer", "company": "Acme"})
    assert response.status_code == 401


def test_get_job_requires_auth():
    response = client.get("/jobs/some-uuid")
    assert response.status_code == 401


def test_update_job_requires_auth():
    response = client.put("/jobs/some-uuid", json={"title": "Senior Engineer"})
    assert response.status_code == 401


def test_delete_job_requires_auth():
    response = client.delete("/jobs/some-uuid")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /jobs
# ---------------------------------------------------------------------------


def test_list_jobs_returns_user_jobs():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == SAMPLE_JOB["id"]
    assert body[0]["company"] == "TechCorp"


def test_list_jobs_empty():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == []


def test_list_jobs_scoped_to_user():
    """Verify the query filters by user_id."""
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/jobs", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


# ---------------------------------------------------------------------------
# POST /jobs
# ---------------------------------------------------------------------------


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


def test_create_job_missing_title_returns_422():
    response = client.post(
        "/jobs",
        json={"company": "Acme"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


def test_create_job_missing_company_returns_422():
    response = client.post(
        "/jobs",
        json={"title": "Engineer"},
        headers={"authorization": AUTH_HEADER},
    )
    assert response.status_code == 422


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


def test_get_job_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get(
            f"/jobs/{SAMPLE_JOB['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 200
    assert response.json()["id"] == SAMPLE_JOB["id"]


def test_get_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/jobs/nonexistent-id", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 404


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


def test_update_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            "/jobs/nonexistent-id",
            json={"status": "rejected"},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 404


def test_update_job_empty_body_returns_400():
    mock_sb, _, _ = make_mock_sb()
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.put(
            f"/jobs/{SAMPLE_JOB['id']}",
            json={},
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 400


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


def test_delete_job_success():
    mock_sb, _, _ = make_mock_sb(data=[SAMPLE_JOB])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete(
            f"/jobs/{SAMPLE_JOB['id']}",
            headers={"authorization": AUTH_HEADER},
        )
    assert response.status_code == 204


def test_delete_job_not_found():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.delete("/jobs/nonexistent-id", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 404


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


def test_job_create_defaults():
    job = JobCreate(title="Engineer", company="Acme")
    assert job.status == "applied"
    assert job.location is None
    assert job.applied_date is None
    assert job.description is None
    assert job.notes is None


def test_job_create_all_fields():
    job = JobCreate(
        title="Backend Engineer",
        company="TechCorp",
        location="Remote",
        status="interviewing",
        description="Build APIs",
        notes="Referral from alumni",
    )
    assert job.status == "interviewing"
    assert job.location == "Remote"


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


def test_get_profile_requires_auth():
    response = client.get("/profile")
    assert response.status_code == 401


def test_put_profile_requires_auth():
    response = client.put("/profile", json={"full_name": "Jane"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /profile
# ---------------------------------------------------------------------------


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


def test_get_profile_scoped_to_user():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/profile", headers={"authorization": AUTH_HEADER})
    mock_query.eq.assert_any_call("user_id", MOCK_USER_ID)


def test_get_profile_selects_all_fields():
    mock_sb, mock_query, _ = make_mock_sb(data=[SAMPLE_PROFILE])
    with patch("main.get_supabase", return_value=mock_sb):
        client.get("/profile", headers={"authorization": AUTH_HEADER})
    mock_query.select.assert_called_with("*")


# ---------------------------------------------------------------------------
# PUT /profile
# ---------------------------------------------------------------------------


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


def test_get_profile_completion_fully_populated_profile():
    completion = get_profile_completion(SAMPLE_PROFILE)
    assert completion["required_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["completed_fields"] == list(PROFILE_REQUIRED_FIELDS)
    assert completion["missing_fields"] == []
    assert completion["completed_count"] == 6
    assert completion["required_count"] == 6
    assert completion["completion_percentage"] == 100
    assert completion["is_complete"] is True


def test_normalize_profile_value_edge_cases():
    assert _normalize_profile_value("   ") == ""
    assert _normalize_profile_value("") == ""
    assert _normalize_profile_value(None) == ""
    assert _normalize_profile_value(123) == ""


# ---------------------------------------------------------------------------
# ProfileUpsert schema validation
# ---------------------------------------------------------------------------


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
            json={"title": "Software Engineer", "company": "TechCorp", "start_year": 2020},
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
            json={"title": "  Software Engineer  ", "company": "Acme", "start_year": 2020},
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


# ---------------------------------------------------------------------------
# PUT /experience/reorder
# ---------------------------------------------------------------------------


def test_reorder_experience_success():
    exp2 = {**SAMPLE_EXPERIENCE, "id": "exp-uuid-2222", "title": "Senior Engineer", "position": 1}
    reordered = [{**exp2, "position": 0}, {**SAMPLE_EXPERIENCE, "position": 1}]
    # 1 select existing IDs + 1 temp upsert + 1 final upsert + 1 final select
    mock_sb, _ = _make_mock_sb_with_side_effects(
        [{"id": exp2["id"]}, {"id": SAMPLE_EXPERIENCE["id"]}],
        reordered,
        reordered,
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
    mock_sb, _ = _make_mock_sb_with_side_effects([], [])
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
    try:
        ExperienceCreate(company="Acme", start_year=2020)
        assert False, "Should have raised"
    except Exception:
        pass


def test_experience_create_requires_company():
    try:
        ExperienceCreate(title="Engineer", start_year=2020)
        assert False, "Should have raised"
    except Exception:
        pass


def test_experience_create_requires_start_year():
    try:
        ExperienceCreate(title="Engineer", company="Acme")
        assert False, "Should have raised"
    except Exception:
        pass


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
