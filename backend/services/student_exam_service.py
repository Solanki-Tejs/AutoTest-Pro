from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from services.exam_service import get_exam_by_id
from services.question_bank_service import get_active_question_bank
import uuid

_tables_ensured = False

def ensure_tables(db: Session):
    global _tables_ensured
    if _tables_ensured:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS exam_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
            student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            started_at TIMESTAMP WITH TIME ZONE NOT NULL,
            deadline TIMESTAMP WITH TIME ZONE NOT NULL,
            completed_at TIMESTAMP WITH TIME ZONE NULL,
            UNIQUE(exam_id, student_id)
        )
    """))
    db.commit()
    _tables_ensured = True

def has_exam_attempts(exam_id: str, db: Session) -> bool:
    """Check if any students have attempted this exam"""
    ensure_tables(db)
    query = text("SELECT 1 FROM exam_attempts WHERE exam_id = :exam_id LIMIT 1")
    result = db.execute(query, {"exam_id": exam_id})
    return result.first() is not None

def validate_enrollment_and_schedule(student_id: int, exam_id: str, db: Session) -> dict:
    ensure_tables(db)
    # Check if student is enrolled in the class of the exam
    query = text("""
        SELECT e.*, ce.created_at as enrollment_date
        FROM exams e
        JOIN class_enrollments ce ON e.class_id = ce.class_id
        WHERE e.id = :exam_id AND ce.student_id = :student_id AND ce.status = 'approved'
    """)
    result = db.execute(query, {"exam_id": exam_id, "student_id": student_id})
    exam = result.mappings().first()
    
    if not exam:
        raise ValueError("Student is not enrolled in this exam's class")
        
    if exam["start_time"] and exam["enrollment_date"] > exam["start_time"]:
        raise ValueError("You cannot take this exam because you enrolled in the class after the exam started.")
        
    if exam["status"] != "published":
        raise ValueError("Exam is not published")
        
    now = datetime.now(timezone.utc)
    
    if exam["start_time"] and now < exam["start_time"].replace(tzinfo=timezone.utc):
        raise ValueError("Exam has not started yet")
        
    if exam["end_time"] and now > exam["end_time"].replace(tzinfo=timezone.utc):
        raise ValueError("Exam has already ended")
        
    return dict(exam)


def start_exam_attempt(student_id: int, exam_id: str, db: Session) -> dict:
    exam = validate_enrollment_and_schedule(student_id, exam_id, db)
    
    # Check if attempt already exists
    query = text("SELECT * FROM exam_attempts WHERE exam_id = :exam_id AND student_id = :student_id")
    result = db.execute(query, {"exam_id": exam_id, "student_id": student_id})
    attempt = result.mappings().first()
    
    now = datetime.now(timezone.utc)
    
    if attempt:
        # Return existing attempt
        if attempt["completed_at"]:
            raise ValueError("Exam already completed")
            
        if now > attempt["deadline"]:
            raise ValueError("Exam attempt deadline has passed")
            
        return dict(attempt)
    
    # Create new attempt
    duration_minutes = exam["duration_minutes"]
    deadline = now + timedelta(minutes=duration_minutes)
    
    # Cap deadline at exam end_time if it exists
    if exam["end_time"]:
        exam_end = exam["end_time"].replace(tzinfo=timezone.utc)
        if deadline > exam_end:
            deadline = exam_end
            
    insert_query = text("""
        INSERT INTO exam_attempts (exam_id, student_id, started_at, deadline)
        VALUES (:exam_id, :student_id, :started_at, :deadline)
        RETURNING id, exam_id, student_id, started_at, deadline, completed_at
    """)
    
    res = db.execute(insert_query, {
        "exam_id": exam_id,
        "student_id": student_id,
        "started_at": now,
        "deadline": deadline
    })
    new_attempt = res.mappings().one()
    db.commit()
    
    return dict(new_attempt)


def get_sanitized_question_bank(exam_id: str) -> Dict[str, Any]:
    qb = get_active_question_bank(exam_id)
    if not qb:
        raise ValueError("Question bank not found")
        
    sanitized_sections = []
    
    for section in qb.get("question_body", {}).get("sections", []):
        sanitized_questions = []
        for q in section.get("questions", []):
            sanitized_q = {
                "question_id": q.get("question_id"),
                "question_text": q.get("question_text"),
                "type": q.get("type"),
                "mark": q.get("mark"),
                "order": q.get("order"),
            }
            if "options" in q:
                sanitized_q["options"] = q["options"]
            sanitized_questions.append(sanitized_q)
            
        sanitized_sections.append({
            "sectionNo": section.get("sectionNo"),
            "sectionName": section.get("sectionName"),
            "questions": sanitized_questions
        })
        
    return {
        "exam_id": qb["exam_id"],
        "version": qb["version"],
        "sections": sanitized_sections
    }


def submit_exam_attempt(student_id: int, exam_id: str, answers: List[Dict[str, Any]], db: Session) -> dict:
    ensure_tables(db)
    
    query = text("SELECT * FROM exam_attempts WHERE exam_id = :exam_id AND student_id = :student_id")
    result = db.execute(query, {"exam_id": exam_id, "student_id": student_id})
    attempt = result.mappings().first()
    
    if not attempt:
        raise ValueError("Exam attempt not found. You must start the exam first.")
        
    if attempt["completed_at"]:
        raise ValueError("Exam already submitted")
        
    now = datetime.now(timezone.utc)
    
    if now > attempt["deadline"]:
        raise ValueError("Exam deadline has passed. Submissions are no longer accepted.")
        
    # Mark as completed
    update_query = text("""
        UPDATE exam_attempts
        SET completed_at = :completed_at
        WHERE id = :attempt_id
        RETURNING id, exam_id, student_id, started_at, deadline, completed_at
    """)
    
    res = db.execute(update_query, {
        "completed_at": now,
        "attempt_id": attempt["id"]
    })
    
    completed_attempt = res.mappings().one()
    db.commit()
    
    from databases.mongo import get_mongo_db
    mongo_db = get_mongo_db()
    
    submission_data = {
        "exam_id": exam_id,
        "student_id": student_id,
        "attempt_id": attempt["id"],
        "answers": answers,
        "submitted_at": now.isoformat()
    }
    mongo_db.student_submissions.insert_one(submission_data)
    
    return dict(completed_attempt)
