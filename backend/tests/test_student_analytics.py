import pytest
from unittest.mock import MagicMock, patch
from services.student_exam_service import get_student_result_analytics

def test_student_result_analytics_cohort_and_taxonomy():
    mock_db = MagicMock()
    mock_cohort = [
        {"student_id": 101, "score": 90.0, "max_marks": 100},
        {"student_id": 102, "score": 80.0, "max_marks": 100},
        {"student_id": 103, "score": 70.0, "max_marks": 100},
    ]
    mock_db.execute.return_value.mappings.return_value.all.return_value = mock_cohort

    mock_proctoring_doc = {
        "attempt_id": "att-1",
        "events": [
            {"eventType": "AUDIO_VIOLATION", "details": {"description": "Noise detected"}},
            {"eventType": "TAB_SWITCH", "details": {"description": "Switched tab"}},
        ]
    }

    mock_answers_doc = {
        "attempt_id": "att-1",
        "answers": [
            {
                "question_id": "q1",
                "answer": "A",
                "evaluation": {"ai_assigned_marks": 5, "modified_by_teacher": False}
            }
        ]
    }

    mock_qb = {
        "question_body": {
            "sections": [
                {
                    "questions": [
                        {"question_id": "q1", "mark": 5, "bloom_level": "Apply", "type": "mcq"}
                    ]
                }
            ]
        }
    }

    mock_mongo = MagicMock()
    mock_mongo.proctoring_events.find_one.return_value = mock_proctoring_doc
    mock_mongo.exam_attempt_answers.find_one.return_value = mock_answers_doc

    with patch('databases.mongo.get_mongo_db', return_value=mock_mongo), \
         patch('services.student_exam_service.get_active_question_bank', return_value=mock_qb), \
         patch('services.student_exam_service.ensure_tables'):

        analytics = get_student_result_analytics(102, "exam-1", "att-1", mock_db)

        # Cohort verification
        cohort = analytics["cohort"]
        assert cohort["total_candidates"] == 3
        assert cohort["rank"] == 2
        assert cohort["class_average"] == 80.0
        assert cohort["highest_score"] == 90.0

        # Proctoring verification
        proc = analytics["proctoring"]
        assert proc["total_violations"] == 2
        assert proc["audio_violations"] == 1
        assert proc["browser_violations"] == 1

        # Taxonomy verification
        tax = analytics["taxonomy"]
        assert len(tax) == 1
        assert tax[0]["level"] == "Apply"
        assert tax[0]["earned"] == 5.0
        assert tax[0]["percentage"] == 100
