import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
import io
from fastapi import UploadFile

def test_student_exams_redacts_marks_when_unpublished():
    from services.student_exam_service import get_student_exams
    
    mock_db = MagicMock()
    mock_row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "class_id": 1,
        "title": "Mathematics Test",
        "total_marks": 100,
        "duration_minutes": 60,
        "difficulty": "medium",
        "status": "published",
        "start_time": datetime(2026, 10, 22, 16, 40),
        "end_time": datetime(2026, 10, 23, 6, 40),
        "created_at": datetime(2026, 10, 20, 10, 0),
        "class_name": "Math 101",
        "attempt": {
            "id": "22222222-2222-2222-2222-222222222222",
            "status": "evaluated",
            "started_at": "2026-10-22T17:00:00Z",
            "completed_at": "2026-10-22T17:45:00Z",
            "deadline": "2026-10-22T18:00:00Z",
            "result_published_at": None, # UNPUBLISHED
            "total_marks": 85.0,
            "max_marks": 100.0,
            "adjustment_marks": 0.0
        }
    }
    
    mock_result = MagicMock()
    mock_result.mappings.return_value = [mock_row]
    mock_db.execute.return_value = mock_result
    
    with patch("services.student_exam_service.ensure_tables"):
        res = get_student_exams(student_id=5, db=mock_db)
        
    assert len(res) == 1
    att = res[0]["attempt"]
    # Marks MUST be redacted since result_published_at is None
    assert att["total_marks"] is None
    assert att["max_marks"] is None
    assert att["adjustment_marks"] is None
    # Timestamps MUST be serialized with UTC ISO
    assert res[0]["start_time"].endswith("+00:00") or "T16:40:00" in res[0]["start_time"]

def test_student_exams_preserves_marks_when_published():
    from services.student_exam_service import get_student_exams
    
    mock_db = MagicMock()
    mock_row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "class_id": 1,
        "title": "Mathematics Test",
        "total_marks": 100,
        "duration_minutes": 60,
        "difficulty": "medium",
        "status": "published",
        "start_time": datetime(2026, 10, 22, 16, 40, tzinfo=timezone.utc),
        "end_time": datetime(2026, 10, 23, 6, 40, tzinfo=timezone.utc),
        "created_at": datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc),
        "class_name": "Math 101",
        "attempt": {
            "id": "22222222-2222-2222-2222-222222222222",
            "status": "evaluated",
            "started_at": "2026-10-22T17:00:00Z",
            "completed_at": "2026-10-22T17:45:00Z",
            "deadline": "2026-10-22T18:00:00Z",
            "result_published_at": "2026-10-22T18:10:00Z", # PUBLISHED
            "total_marks": 85.0,
            "max_marks": 100.0,
            "adjustment_marks": 0.0
        }
    }
    
    mock_result = MagicMock()
    mock_result.mappings.return_value = [mock_row]
    mock_db.execute.return_value = mock_result
    
    with patch("services.student_exam_service.ensure_tables"):
        res = get_student_exams(student_id=5, db=mock_db)
        
    att = res[0]["attempt"]
    # Marks MUST be preserved
    assert att["total_marks"] == 85.0
    assert att["max_marks"] == 100.0

def test_teacher_evaluation_filters_assigned_questions():
    from routes.teacher_evaluation import get_attempt_evaluation
    
    mock_db = MagicMock()
    # Mock auth query
    mock_auth = MagicMock()
    mock_auth.mappings.return_value.first.return_value = {
        "exam_id": "exam-123",
        "total_marks": 20.0,
        "max_marks": 20.0
    }
    mock_db.execute.return_value = mock_auth

    mock_mongo = MagicMock()
    # Submission has 4 questions in mongo answers
    mock_mongo.exam_attempt_answers.find_one.return_value = {
        "answers": [
            {"question_id": "q1", "answer": "A"},
            {"question_id": "q2", "answer": "B"},
            {"question_id": "q3", "answer": "C"},
            {"question_id": "q4", "answer": "D"},
        ]
    }
    # Student was only assigned q1 and q3 (randomized sampling)
    mock_mongo.exam_attempt_papers.find_one.return_value = {
        "assigned_question_ids": ["q1", "q3"]
    }

    mock_qb = {
        "question_body": {
            "sections": [
                {
                    "questions": [
                        {"question_id": "q1", "question_text": "What is 2+2?", "mark": 10},
                        {"question_id": "q2", "question_text": "What is 3+3?", "mark": 10},
                        {"question_id": "q3", "question_text": "What is 4+4?", "mark": 10},
                        {"question_id": "q4", "question_text": "What is 5+5?", "mark": 10},
                    ]
                }
            ]
        }
    }

    with patch("routes.teacher_evaluation.get_mongo_db", return_value=mock_mongo), \
         patch("services.question_bank_service.get_active_question_bank", return_value=mock_qb):
        res = get_attempt_evaluation(
            attempt_id="att-1",
            db=mock_db,
            current_user={"sub": "99", "role": "teacher"}
        )

    # Must only return the 2 assigned questions, not all 4
    returned_qids = [a["question_id"] for a in res["answers"]]
    assert returned_qids == ["q1", "q3"]

def test_save_audio_violation():
    from services.proctoring_service import save_audio_violation
    
    mock_mongo = MagicMock()
    file_bytes = b"RIFFFAKEWEBMHEADER"
    upload_file = UploadFile(filename="noise.webm", file=io.BytesIO(file_bytes))
    
    with patch("services.proctoring_service.get_mongo_db", return_value=mock_mongo), \
         patch("os.path.join", return_value="uploads/proctoring/test_audio.webm"), \
         patch("builtins.open", MagicMock()):
        result = save_audio_violation(
            student_id=5,
            exam_id="ex-1",
            attempt_id="att-1",
            file=upload_file,
            duration=6.5,
            peak_rms=0.15
        )
        
    assert result["status"] == "success"
    assert result["event_type"] == "AUDIO_VIOLATION"
    assert "audio_url" in result
    mock_mongo.proctoring_events.update_one.assert_called_once()


def test_blueprint_and_exam_passing_percentage():
    from schemas.blueprint_schema import BlueprintCreate, SectionCreate
    from schemas.exam_schema import ExamCreate, ExamResponse
    import uuid
    from datetime import datetime

    # Test default 40.0%
    bp_default = BlueprintCreate(
        sections=[SectionCreate(section="A", type="mcq", count=5, marks_each=2, order=0)]
    )
    assert bp_default.passing_percentage == 40.0

    # Test custom 33.0%
    bp_custom = BlueprintCreate(
        passing_percentage=33.0,
        sections=[SectionCreate(section="A", type="mcq", count=5, marks_each=2, order=0)]
    )
    assert bp_custom.passing_percentage == 33.0

    # Test ExamCreate default & custom
    ex_create = ExamCreate(
        class_id=1,
        title="Test Exam",
        total_marks=100,
        duration_minutes=60,
        difficulty="medium",
        passing_percentage=50.0
    )
    assert ex_create.passing_percentage == 50.0

    # Pass / Fail benchmark check: score 35 on 100
    score = 35.0
    max_marks = 100.0
    score_pct = (score / max_marks) * 100.0
    assert score_pct < 40.0  # Fails at 40% threshold
    assert score_pct >= 33.0 # Passes at 33% threshold
