import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)

def test_syllabus_upload_unauthorized():
    response = client.post("/api/classes/1/syllabus", files={"file": ("test.pdf", b"test")}, data={"title": "Test"})
    assert response.status_code == 401

def test_syllabus_list_unauthorized():
    response = client.get("/api/classes/1/syllabus")
    assert response.status_code == 401

def test_syllabus_download_unauthorized():
    response = client.get("/api/syllabus/123e4567-e89b-12d3-a456-426614174000/file")
    assert response.status_code == 401

def test_syllabus_status_unauthorized():
    response = client.get("/api/syllabus/123e4567-e89b-12d3-a456-426614174000/status")
    assert response.status_code == 401

def test_syllabus_retry_unauthorized():
    response = client.post("/api/syllabus/123e4567-e89b-12d3-a456-426614174000/retry")
    assert response.status_code == 401
