"""
Backend tests for jobhub.

Supabase is fully mocked — no live database or credentials required.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import JobCreate, JobUpdate, ProfileUpsert, app

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
    assert body["full_name"] == "Jane Smith"
    assert body["headline"] == "Software Engineer"
    assert body["user_id"] == MOCK_USER_ID


def test_get_profile_returns_empty_when_no_profile():
    mock_sb, _, _ = make_mock_sb(data=[])
    with patch("main.get_supabase", return_value=mock_sb):
        response = client.get("/profile", headers={"authorization": AUTH_HEADER})
    assert response.status_code == 200
    assert response.json() == {}


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
    assert response.json()["full_name"] == "Jane Smith"


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
