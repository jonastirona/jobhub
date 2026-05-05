"""
Shared test infrastructure for the jobhub backend test suite.

Constants, the TestClient instance, and Supabase mock helpers are defined here
so they can be imported by any test module without duplication.
"""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Shared constants
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


# ---------------------------------------------------------------------------
# Supabase mock helpers
# ---------------------------------------------------------------------------


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
