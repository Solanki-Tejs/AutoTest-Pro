import pytest
from unittest.mock import MagicMock, patch
from services.question_generation_service import calculate_pool_size
from services.student_exam_service import get_sanitized_question_bank
from services.exam_publish_service import validate_and_publish_exam
from schemas.blueprint_schema import BlueprintResponse, SectionResponse
from datetime import datetime, timezone, timedelta

def test_calculate_pool_size():
    assert calculate_pool_size(1) == 6
    assert calculate_pool_size(2) == 6
    assert calculate_pool_size(3) == 9
    assert calculate_pool_size(10) == 18
    assert calculate_pool_size(20) == 30

def test_get_sanitized_question_bank_filtered():
    mock_bank = {
        "exam_id": "exam-1",
        "version": 1,
        "question_body": {
            "sections": [
                {
                    "sectionNo": "A",
                    "sectionName": "MCQ Section",
                    "questions": [
                        {"question_id": "q1", "question_text": "Q1", "mark": 1, "type": "mcq"},
                        {"question_id": "q2", "question_text": "Q2", "mark": 1, "type": "mcq"},
                        {"question_id": "q3", "question_text": "Q3", "mark": 1, "type": "mcq"},
                        {"question_id": "q4", "question_text": "Q4", "mark": 1, "type": "mcq"},
                        {"question_id": "q5", "question_text": "Q5", "mark": 1, "type": "mcq"},
                        {"question_id": "q6", "question_text": "Q6", "mark": 1, "type": "mcq"},
                    ]
                }
            ]
        }
    }

    mock_paper_doc = {
        "attempt_id": "att-1",
        "assigned_question_ids": ["q2", "q4"]
    }

    mock_mongo = MagicMock()
    mock_mongo.exam_attempt_papers.find_one.return_value = mock_paper_doc

    with patch('services.student_exam_service.get_active_question_bank', return_value=mock_bank), \
         patch('databases.mongo.get_mongo_db', return_value=mock_mongo):
        
        result = get_sanitized_question_bank("exam-1", attempt_id="att-1")
        questions = result["sections"][0]["questions"]
        assert len(questions) == 2
        qids = [q["question_id"] for q in questions]
        assert "q2" in qids
        assert "q4" in qids
        assert "q1" not in qids
        # Orders renumbered
        assert questions[0]["order"] == 0
        assert questions[1]["order"] == 1
