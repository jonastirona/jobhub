from main import JobCreate


def test_backend_unit_test_framework_is_working():
    job = JobCreate(title="Engineer", company="Acme")

    assert job.status == "applied"
