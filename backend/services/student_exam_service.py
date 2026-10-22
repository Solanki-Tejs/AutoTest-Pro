from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from services.exam_service import get_exam_by_id
from services.question_bank_service import get_active_question_bank
import uuid
import random

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
            status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
            total_marks NUMERIC(10, 2) NULL,
            max_marks NUMERIC(10, 2) NULL,
            adjustment_marks NUMERIC(10, 2) DEFAULT 0.0,
            evaluated_at TIMESTAMP WITH TIME ZONE NULL,
            result_published_at TIMESTAMP WITH TIME ZONE NULL,
            UNIQUE(exam_id, student_id)
        )
    """))
    db.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_attempts' AND column_name='status') THEN
                ALTER TABLE exam_attempts ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'in_progress';
                UPDATE exam_attempts SET status = 'submitted' WHERE completed_at IS NOT NULL AND status = 'in_progress';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_attempts' AND column_name='total_marks') THEN
                ALTER TABLE exam_attempts ADD COLUMN total_marks NUMERIC(10, 2) NULL;
                ALTER TABLE exam_attempts ADD COLUMN max_marks NUMERIC(10, 2) NULL;
                ALTER TABLE exam_attempts ADD COLUMN evaluated_at TIMESTAMP WITH TIME ZONE NULL;
                ALTER TABLE exam_attempts ADD COLUMN result_published_at TIMESTAMP WITH TIME ZONE NULL;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='exam_attempts' AND column_name='adjustment_marks') THEN
                ALTER TABLE exam_attempts ADD COLUMN adjustment_marks NUMERIC(10, 2) DEFAULT 0.0;
            END IF;
        END
        $$;
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
        
    if exam["start_time"] and exam["enrollment_date"].replace(tzinfo=timezone.utc) > exam["start_time"].replace(tzinfo=timezone.utc):
        raise ValueError("You cannot take this exam because you enrolled in the class after the exam started.")
        
    if exam["status"] != "published":
        raise ValueError("Exam is not published")
        
    now = datetime.now(timezone.utc)
    
    if exam["start_time"] and now < exam["start_time"].replace(tzinfo=timezone.utc):
        raise ValueError("Exam has not started yet")
        
    if exam["end_time"] and now > exam["end_time"].replace(tzinfo=timezone.utc):
        raise ValueError("Exam has already ended")
        
    return dict(exam)

def get_student_exams(student_id: int, db: Session) -> List[Dict[str, Any]]:
    ensure_tables(db)
    query = text("""
        SELECT e.*, c.name as class_name,
            (SELECT json_build_object(
                'id', ea.id,
                'status', ea.status,
                'started_at', ea.started_at,
                'completed_at', ea.completed_at,
                'deadline', ea.deadline,
                'result_published_at', ea.result_published_at,
                'total_marks', ea.total_marks,
                'max_marks', ea.max_marks,
                'adjustment_marks', ea.adjustment_marks
            ) FROM exam_attempts ea WHERE ea.exam_id = e.id AND ea.student_id = :student_id LIMIT 1) as attempt
        FROM exams e
        JOIN class_enrollments ce ON e.class_id = ce.class_id
        JOIN classes c ON e.class_id = c.id
        WHERE ce.student_id = :student_id AND ce.status = 'approved' AND e.status = 'published'
        ORDER BY e.start_time DESC
    """)
    result = db.execute(query, {"student_id": student_id})
    exams = []
    for row in result.mappings():
        exam_dict = dict(row)
        exams.append(exam_dict)
    return exams

def get_student_attempt(student_id: int, exam_id: str, db: Session) -> dict:
    ensure_tables(db)
    query = text("SELECT * FROM exam_attempts WHERE exam_id = :exam_id AND student_id = :student_id")
    result = db.execute(query, {"exam_id": exam_id, "student_id": student_id})
    attempt = result.mappings().first()
    
    if not attempt:
        raise ValueError("Exam attempt not found")
        
    attempt_dict = dict(attempt)
    
    # Fetch saved answers from Mongo
    try:
        from databases.mongo import get_mongo_db
        mongo_db = get_mongo_db()
        saved_doc = mongo_db.exam_attempt_answers.find_one({"attempt_id": str(attempt["id"])})
        if saved_doc and "answers" in saved_doc:
            # Strip evaluations if not published
            if not attempt_dict.get("result_published_at"):
                for ans in saved_doc["answers"]:
                    ans.pop("evaluation", None)
            attempt_dict["saved_answers"] = saved_doc["answers"]
    except Exception:
        pass
        
    return attempt_dict

def save_attempt_answers(student_id: int, exam_id: str, attempt_id: str, answers: List[Dict[str, Any]], db: Session) -> dict:
    attempt = get_student_attempt(student_id, exam_id, db)
    
    if str(attempt["id"]) != attempt_id:
        raise ValueError("Invalid attempt ID")
        
    if attempt["completed_at"]:
        raise ValueError("Exam already submitted")
        
    now = datetime.now(timezone.utc)
    # 2-minute grace period for network latency and auto-submissions
    if now > attempt["deadline"] + timedelta(minutes=2):
        raise ValueError("Exam deadline has passed")
        
    # Save answers to Mongo
    from databases.mongo import get_mongo_db
    mongo_db = get_mongo_db()
    
    mongo_db.exam_attempt_answers.update_one(
        {"attempt_id": attempt_id, "student_id": student_id, "exam_id": exam_id},
        {"$set": {"answers": answers, "updated_at": now.isoformat()}},
        upsert=True
    )
    
    return {"status": "saved", "updated_at": now.isoformat()}

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
        INSERT INTO exam_attempts (exam_id, student_id, started_at, deadline, status)
        VALUES (:exam_id, :student_id, :started_at, :deadline, 'in_progress')
        RETURNING id, exam_id, student_id, started_at, deadline, completed_at, status
    """)
    
    res = db.execute(insert_query, {
        "exam_id": exam_id,
        "student_id": student_id,
        "started_at": now,
        "deadline": deadline
    })
    new_attempt = res.mappings().one()
    db.commit()

    # Anti-Cheat: Randomly sample questions from the question pool for this student
    try:
        from databases.mongo import get_mongo_db
        from services.exam_blueprint_service import get_blueprint
        mongo_db = get_mongo_db()
        qb = get_active_question_bank(exam_id)
        blueprint = get_blueprint(exam_id)
        assigned_qids = []

        if qb:
            sections = qb.get("question_body", {}).get("sections", [])
            for idx, sec in enumerate(sections):
                sec_questions = sec.get("questions", [])
                # Determine required count from blueprint or section metadata
                bp_count = None
                if blueprint and idx < len(blueprint.sections):
                    bp_count = blueprint.sections[idx].count
                req_count = bp_count or sec.get("required_count") or len(sec_questions)

                if len(sec_questions) > req_count:
                    chosen = random.sample(sec_questions, req_count)
                else:
                    chosen = list(sec_questions)
                for q in chosen:
                    if q.get("question_id"):
                        assigned_qids.append(q["question_id"])

            mongo_db.exam_attempt_papers.update_one(
                {"attempt_id": str(new_attempt["id"])},
                {"$set": {
                    "attempt_id": str(new_attempt["id"]),
                    "exam_id": exam_id,
                    "student_id": student_id,
                    "assigned_question_ids": assigned_qids,
                    "created_at": now.isoformat()
                }},
                upsert=True
            )
    except Exception as pool_err:
        print(f"[AntiCheat] Error sampling question pool: {pool_err}")

    return dict(new_attempt)


def get_sanitized_question_bank(exam_id: str, student_id: int = None, attempt_id: str = None) -> Dict[str, Any]:
    qb = get_active_question_bank(exam_id)
    if not qb:
        raise ValueError("Question bank not found")

    # Check if student has assigned questions from randomized pool
    assigned_qids = None
    if attempt_id or student_id:
        try:
            from databases.mongo import get_mongo_db
            mongo_db = get_mongo_db()
            query_filter = {}
            if attempt_id:
                query_filter["attempt_id"] = str(attempt_id)
            elif student_id:
                query_filter["student_id"] = student_id
                query_filter["exam_id"] = exam_id
            paper_doc = mongo_db.exam_attempt_papers.find_one(query_filter)
            if paper_doc and "assigned_question_ids" in paper_doc:
                assigned_qids = set(paper_doc["assigned_question_ids"])
        except Exception:
            pass

    sanitized_sections = []
    q_counter = 0

    for section in qb.get("question_body", {}).get("sections", []):
        sanitized_questions = []
        for q in section.get("questions", []):
            # If student has assigned questions, only include those
            if assigned_qids is not None and q.get("question_id") not in assigned_qids:
                continue

            sanitized_q = {
                "question_id": q.get("question_id"),
                "question_text": q.get("question_text"),
                "type": q.get("type"),
                "mark": q.get("mark"),
                "order": q_counter,
            }
            q_counter += 1
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
        # Idempotent return: already submitted
        return dict(attempt)
        
    now = datetime.now(timezone.utc)
    
    # Allow submission (or auto-submission) to proceed even if deadline passed.
    # The autosave endpoint enforces the strict cutoff for answering questions.
    # But if you want a strict cutoff for submissions too, we use a grace period:
    if now > attempt["deadline"] + timedelta(minutes=2):
        pass # In many systems, we just forcefully submit anyway. We'll allow it for auto-submit.
        
    # Mark as completed and submitted
    update_query = text("""
        UPDATE exam_attempts
        SET completed_at = :completed_at, status = 'submitted'
        WHERE id = :attempt_id
        RETURNING id, exam_id, student_id, started_at, deadline, completed_at, status
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
        "attempt_id": str(attempt["id"]),
        "answers": answers,
        "submitted_at": now.isoformat(),
        "submission_version": 1
    }
    
    # Pre-populate evaluation structure for each answer
    for ans in submission_data["answers"]:
        ans["evaluation"] = {
            "status": "pending",
            "evaluator_model": None,
            "ai_assigned_marks": None,
            "ai_feedback": None,
            "ai_justification": None,
            "ai_confidence_level": None,
            "teacher_override_marks": None,
            "teacher_feedback": None,
            "modified_by_teacher": False,
            "evaluated_at": None,
            "reviewed_by": None,
            "reviewed_at": None,
            "override_reason": None,
            "error_code": None
        }
        
    mongo_db.exam_attempt_answers.update_one(
        {"attempt_id": str(attempt["id"])},
        {"$set": submission_data},
        upsert=True
    )

    try:
        from services.notification_service import create_notification
        ex_info = db.execute(
            text("SELECT e.title, c.teacher_id, u.email as student_email FROM exams e JOIN classes c ON e.class_id = c.id JOIN users u ON u.id = :sid WHERE e.id = :eid"),
            {"eid": exam_id, "sid": student_id}
        ).mappings().first()
        if ex_info:
            create_notification(
                user_id=ex_info["teacher_id"],
                title="Exam Attempt Submitted",
                message=f"Student {ex_info['student_email']} submitted their paper for '{ex_info['title']}'.",
                notification_type="exam",
                link=f"/teacher/exams/{exam_id}/results",
                db=db
            )
    except Exception as e:
        print(f"[NOTIFICATION ERROR] {e}")
    
    return dict(completed_attempt)



def get_student_result_analytics(student_id: int, exam_id: str, attempt_id: str, db: Session) -> dict:
    """Calculates comprehensive candidate result statistics and cohort standing."""
    ensure_tables(db)

    # 1. Cohort Performance Stats
    cohort_query = text("""
        SELECT student_id, (COALESCE(total_marks, 0) + COALESCE(adjustment_marks, 0)) as score, max_marks
        FROM exam_attempts
        WHERE exam_id = :exam_id AND status = 'evaluated' AND completed_at IS NOT NULL
        ORDER BY score DESC
    """)
    cohort_rows = db.execute(cohort_query, {"exam_id": exam_id}).mappings().all()
    total_candidates = len(cohort_rows)
    scores = [float(r["score"]) for r in cohort_rows]

    class_avg = round(sum(scores) / max(total_candidates, 1), 1) if scores else 0.0
    highest_score = max(scores) if scores else 0.0
    lowest_score = min(scores) if scores else 0.0

    # Find rank & percentile
    rank = 1
    for idx, r in enumerate(cohort_rows):
        if r["student_id"] == student_id:
            rank = idx + 1
            break

    percentile = round(((total_candidates - rank) / max(total_candidates, 1)) * 100, 1) if total_candidates > 0 else 100.0

    # 2. Proctoring & Acoustic Telemetry
    from databases.mongo import get_mongo_db
    mongo_db = get_mongo_db()
    proctoring_doc = mongo_db.proctoring_events.find_one({"attempt_id": str(attempt_id)})
    events = proctoring_doc.get("events", []) if proctoring_doc else []

    audio_violations = sum(1 for e in events if e.get("eventType") in ("AUDIO_VIOLATION", "VOICE_DETECTED"))
    face_violations = sum(1 for e in events if e.get("eventType") in ("FACE_NOT_DETECTED", "MULTIPLE_FACES", "HEAD_MOVEMENT"))
    browser_violations = sum(1 for e in events if e.get("eventType") in ("TAB_SWITCH", "WINDOW_BLUR", "FULLSCREEN_EXIT"))
    total_violations = len(events)

    integrity_rating = "HIGH COMPLIANCE" if total_violations == 0 else ("MINOR REVIEW" if total_violations <= 2 else "FLAGGED INCIDENTS")

    # 3. Cognitive & Taxonomy Breakdown
    qb = get_active_question_bank(exam_id)
    answers_doc = mongo_db.exam_attempt_answers.find_one({"attempt_id": str(attempt_id)})
    saved_answers = answers_doc.get("answers", []) if answers_doc else []
    answers_map = {ans.get("question_id"): ans for ans in saved_answers}

    taxonomy_stats = {}
    type_stats = {}

    if qb:
        for sec in qb.get("question_body", {}).get("sections", []):
            for q in sec.get("questions", []):
                qid = q.get("question_id")
                if qid not in answers_map:
                    continue
                ans = answers_map[qid]
                eval_data = ans.get("evaluation", {})
                assigned = float(eval_data.get("teacher_override_marks") if eval_data.get("modified_by_teacher") else eval_data.get("ai_assigned_marks", 0))
                q_mark = float(q.get("mark", 1))
                bloom = q.get("bloom_level") or "Understand"
                q_type = q.get("type") or "mcq"

                # Bloom taxonomy accumulator
                if bloom not in taxonomy_stats:
                    taxonomy_stats[bloom] = {"total_marks": 0.0, "earned_marks": 0.0, "question_count": 0}
                taxonomy_stats[bloom]["total_marks"] += q_mark
                taxonomy_stats[bloom]["earned_marks"] += assigned
                taxonomy_stats[bloom]["question_count"] += 1

                # Type accumulator
                if q_type not in type_stats:
                    type_stats[q_type] = {"total_marks": 0.0, "earned_marks": 0.0, "question_count": 0}
                type_stats[q_type]["total_marks"] += q_mark
                type_stats[q_type]["earned_marks"] += assigned
                type_stats[q_type]["question_count"] += 1

    # Format taxonomy items
    bloom_breakdown = []
    for level, data in taxonomy_stats.items():
        pct = round((data["earned_marks"] / max(data["total_marks"], 1)) * 100)
        bloom_breakdown.append({
            "level": level,
            "earned": round(data["earned_marks"], 1),
            "total": round(data["total_marks"], 1),
            "count": data["question_count"],
            "percentage": pct
        })

    type_breakdown = []
    for tname, data in type_stats.items():
        pct = round((data["earned_marks"] / max(data["total_marks"], 1)) * 100)
        type_breakdown.append({
            "type": tname,
            "earned": round(data["earned_marks"], 1),
            "total": round(data["total_marks"], 1),
            "count": data["question_count"],
            "percentage": pct
        })

    return {
        "cohort": {
            "total_candidates": total_candidates,
            "rank": rank,
            "percentile": percentile,
            "class_average": class_avg,
            "highest_score": highest_score,
            "lowest_score": lowest_score,
        },
        "proctoring": {
            "total_violations": total_violations,
            "audio_violations": audio_violations,
            "face_violations": face_violations,
            "browser_violations": browser_violations,
            "integrity_rating": integrity_rating,
        },
        "taxonomy": bloom_breakdown,
        "question_types": type_breakdown,
    }
