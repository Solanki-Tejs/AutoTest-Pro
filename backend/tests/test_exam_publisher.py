import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from services.exam_publish_service import validate_and_publish_exam
from schemas.blueprint_schema import BlueprintCreate, SectionCreate, BlueprintResponse, SectionResponse

@pytest.fixture
def mock_db():
    return MagicMock()

def test_publish_exam_success(mock_db):
    exam_id = "123e4567-e89b-12d3-a456-426614174000"
    teacher_id = 1
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = datetime.now(timezone.utc) + timedelta(days=2)

    mock_exam = {
        "id": exam_id,
        "class_id": 1,
        "total_marks": 100,
        "duration_minutes": 60,
        "selected_pdf_ids": ["pdf1"]
    }
    
    mock_blueprint = BlueprintResponse(
        exam_id=exam_id,
        total_marks=100,
        sections=[
            SectionResponse(
                section_id="sec1",
                section="Section A",
                type="mcq",
                count=50,
                marks_each=2,
                total_marks=100
            )
        ]
    )
    
    mock_question_bank = {
        "status": "approved",
        "question_body": {
            "sections": [
                {
                    "section_id": "sec1",
                    "questions": [{"question_id": f"q{i}", "mark": 2} for i in range(50)]
                }
            ]
        }
    }
    
    mock_answer_bank = {
        "status": "approved",
        "answer_body": [{"question_id": f"q{i}", "correct_answer": "A"} for i in range(50)]
    }

    with patch('services.exam_service.get_exam_by_id', return_value=mock_exam), \
         patch('services.exam_blueprint_service.get_blueprint', return_value=mock_blueprint), \
         patch('services.question_bank_service.get_active_question_bank', return_value=mock_question_bank), \
         patch('services.answer_bank_service.get_active_answer_bank', return_value=mock_answer_bank), \
         patch('services.syllabus_service.get_available_syllabuses_for_exam', return_value=[{"id": "pdf1", "status": "READY"}]), \
         patch('services.exam_service.update_exam', return_value={**mock_exam, "status": "published"}):
        
        result = validate_and_publish_exam(exam_id, teacher_id, start_time, end_time, mock_db)
        assert result["status"] == "published"


def test_publish_exam_invalid_schedule(mock_db):
    exam_id = "123e4567-e89b-12d3-a456-426614174000"
    teacher_id = 1
    # End time before start time
    start_time = datetime.now(timezone.utc) + timedelta(days=2)
    end_time = datetime.now(timezone.utc) + timedelta(days=1)

    with patch('services.exam_service.get_exam_by_id', return_value={"id": exam_id, "duration_minutes": 60}):
        with pytest.raises(ValueError, match="Start time must be before end time"):
            validate_and_publish_exam(exam_id, teacher_id, start_time, end_time, mock_db)


def test_publish_exam_blueprint_mismatch(mock_db):
    exam_id = "123e4567-e89b-12d3-a456-426614174000"
    teacher_id = 1
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = datetime.now(timezone.utc) + timedelta(days=2)

    mock_exam = {
        "id": exam_id,
        "total_marks": 100, # Expected 100
        "duration_minutes": 60,
        "selected_pdf_ids": ["pdf1"]
    }
    
    mock_blueprint = BlueprintResponse(
        exam_id=exam_id,
        total_marks=100,
        sections=[
            SectionResponse(
                section_id="sec1",
                section="Section A",
                type="mcq",
                count=10,
                marks_each=2,
                total_marks=20
            )
        ]
    )

    with patch('services.exam_service.get_exam_by_id', return_value=mock_exam), \
         patch('services.exam_blueprint_service.get_blueprint', return_value=mock_blueprint), \
         patch('services.syllabus_service.get_available_syllabuses_for_exam', return_value=[{"id": "pdf1", "status": "READY"}]):
        
        with pytest.raises(ValueError, match="Blueprint total marks do not match exam total marks"):
            validate_and_publish_exam(exam_id, teacher_id, start_time, end_time, mock_db)


def test_publish_exam_unapproved_question_bank(mock_db):
    exam_id = "123e4567-e89b-12d3-a456-426614174000"
    teacher_id = 1
    start_time = datetime.now(timezone.utc) + timedelta(days=1)
    end_time = datetime.now(timezone.utc) + timedelta(days=2)

    mock_exam = {
        "id": exam_id,
        "total_marks": 100,
        "duration_minutes": 60,
        "selected_pdf_ids": ["pdf1"]
    }
    
    mock_blueprint = BlueprintResponse(
        exam_id=exam_id,
        total_marks=100,
        sections=[
            SectionResponse(
                section_id="sec1",
                section="Section A",
                type="mcq",
                count=50,
                marks_each=2,
                total_marks=100
            )
        ]
    )
    
    mock_question_bank = {
        "status": "draft", # Not approved
        "question_body": {
            "sections": [
                {
                    "section_id": "sec1",
                    "questions": [{"question_id": f"q{i}", "mark": 2} for i in range(50)]
                }
            ]
        }
    }

    with patch('services.exam_service.get_exam_by_id', return_value=mock_exam), \
         patch('services.exam_blueprint_service.get_blueprint', return_value=mock_blueprint), \
         patch('services.question_bank_service.get_active_question_bank', return_value=mock_question_bank), \
         patch('services.syllabus_service.get_available_syllabuses_for_exam', return_value=[{"id": "pdf1", "status": "READY"}]):
        
        with pytest.raises(ValueError, match="Question bank must be approved before publishing"):
            validate_and_publish_exam(exam_id, teacher_id, start_time, end_time, mock_db)
