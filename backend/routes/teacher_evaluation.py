from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel

from databases.database import get_db
from databases.mongo import get_mongo_db
from routes.dependencies import require_roles

router = APIRouter()

class OverrideRequest(BaseModel):
    marks: float
    reason: str

@router.get("/exams/{exam_id}/attempts")
def get_teacher_exam_attempts(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    # Verify ownership
    user_id = int(current_user["sub"])
    auth_query = text("SELECT 1 FROM exams e JOIN classes c ON e.class_id = c.id WHERE e.id = :exam_id AND c.teacher_id = :teacher_id")
    if not db.execute(auth_query, {"exam_id": exam_id, "teacher_id": user_id}).first():
        raise HTTPException(status_code=403, detail="Not authorized")
        
    query = text("""
        SELECT a.id, a.student_id, u.email as student_email, a.started_at, a.completed_at, a.status, a.total_marks, a.max_marks, a.adjustment_marks, a.result_published_at
        FROM exam_attempts a
        JOIN users u ON a.student_id = u.id
        WHERE a.exam_id = :exam_id
    """)
    result = db.execute(query, {"exam_id": exam_id}).mappings().all()
    attempts = [dict(row) for row in result]
    
    # Fetch cheating summaries from MongoDB
    mongo_db = get_mongo_db()
    proctoring_docs = mongo_db.proctoring_events.find({"exam_id": exam_id})
    proctoring_map = {}
    for doc in proctoring_docs:
        events = doc.get("events", [])
        proctoring_map[doc["attempt_id"]] = {
            "violation_count": len(events),
            "events": events
        }
        
    for a in attempts:
        a["cheating_summary"] = proctoring_map.get(str(a["id"]), {"violation_count": 0, "events": []})
        
    return attempts

@router.get("/attempts/{attempt_id}/evaluation")
def get_attempt_evaluation(attempt_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    # Verify ownership via attempt -> exam -> class -> teacher
    auth_query = text("""
        SELECT e.id as exam_id, a.total_marks, a.max_marks FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    res = db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).mappings().first()
    if not res:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    exam_id = str(res["exam_id"])
    total_marks = float(res["total_marks"]) if res["total_marks"] is not None else 0.0
    max_marks = float(res["max_marks"]) if res["max_marks"] is not None else 0.0
        
    mongo_db = get_mongo_db()
    submission = mongo_db.exam_attempt_answers.find_one({"attempt_id": attempt_id})
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    answers = submission.get("answers", [])

    paper_doc = mongo_db.exam_attempt_papers.find_one({"attempt_id": str(attempt_id)})
    assigned_qids = set(paper_doc.get("assigned_question_ids", [])) if paper_doc and paper_doc.get("assigned_question_ids") else None
    if assigned_qids is not None:
        answers = [ans for ans in answers if ans.get("question_id") in assigned_qids]
    
    from services.question_bank_service import get_active_question_bank
    qb = get_active_question_bank(exam_id)
    if qb:
        q_map = {}
        q_marks = {}
        for section in qb.get("question_body", {}).get("sections", []):
            for q in section.get("questions", []):
                q_map[q["question_id"]] = q.get("question_text", "Unknown Question")
                q_marks[q["question_id"]] = q.get("mark", 1)
                
        for ans in answers:
            ans["question_text"] = q_map.get(ans.get("question_id"), "Question not found")
            ans["max_marks"] = q_marks.get(ans.get("question_id"), 1)
            
    return {
        "answers": answers,
        "total_marks": total_marks,
        "max_marks": max_marks
    }

@router.patch("/attempts/{attempt_id}/questions/{question_id}/marks")
def override_marks(attempt_id: str, question_id: str, payload: OverrideRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    auth_query = text("""
        SELECT e.id as exam_id, a.result_published_at FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    res = db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).mappings().first()
    if not res:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if res["result_published_at"] is not None:
        raise HTTPException(status_code=400, detail="Cannot modify marks: results have already been published and finalized.")

    if not payload.reason:
        raise HTTPException(status_code=400, detail="Reason is required for override")
        
    mongo_db = get_mongo_db()
    submission = mongo_db.exam_attempt_answers.find_one({"attempt_id": attempt_id})
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    answers = submission.get("answers", [])
    updated = False
    new_total = 0.0
    
    for ans in answers:
        if ans.get("question_id") == question_id:
            if "evaluation" not in ans:
                ans["evaluation"] = {}
            ans["evaluation"]["teacher_override_marks"] = payload.marks
            ans["evaluation"]["override_reason"] = payload.reason
            ans["evaluation"]["modified_by_teacher"] = True
            ans["evaluation"]["reviewed_by"] = user_id
            ans["evaluation"]["reviewed_at"] = datetime.now(timezone.utc).isoformat()
            ans["evaluation"]["status"] = "completed"
            updated = True
        
        # Calculate new total
        eval_dict = ans.get("evaluation", {})
        if eval_dict.get("modified_by_teacher"):
            new_total += float(eval_dict.get("teacher_override_marks", 0))
        else:
            new_total += float(eval_dict.get("ai_assigned_marks", 0))
            
    if updated:
        mongo_db.exam_attempt_answers.update_one(
            {"attempt_id": attempt_id},
            {"$set": {"answers": answers}}
        )
        
        # Update total marks in PG
        update_query = text("UPDATE exam_attempts SET total_marks = :new_total WHERE id = :attempt_id")
        db.execute(update_query, {"new_total": new_total, "attempt_id": attempt_id})
        db.commit()
        
    return {"status": "success", "new_total": new_total}

class GlobalMarksRequest(BaseModel):
    adjustment: float

@router.patch("/attempts/{attempt_id}/global_marks")
def update_global_marks(attempt_id: str, payload: GlobalMarksRequest, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    auth_query = text("""
        SELECT a.result_published_at FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    res = db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).mappings().first()
    if not res:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if res["result_published_at"] is not None:
        raise HTTPException(status_code=400, detail="Cannot modify adjustment: results have already been published and finalized.")

    update_query = text("UPDATE exam_attempts SET adjustment_marks = :adj WHERE id = :attempt_id")
    db.execute(update_query, {"adj": payload.adjustment, "attempt_id": attempt_id})
    db.commit()
    
    return {"status": "success", "adjustment_marks": payload.adjustment}

@router.post("/attempts/{attempt_id}/review/approve")
def approve_review(attempt_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    auth_query = text("""
        SELECT a.result_published_at FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    res = db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).mappings().first()
    if not res:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if res["result_published_at"] is not None:
        raise HTTPException(status_code=400, detail="Cannot approve review: results have already been published and finalized.")

    mongo_db = get_mongo_db()
    mongo_db.exam_attempt_answers.update_one(
        {"attempt_id": attempt_id},
        {"$set": {"review_approved": True, "review_approved_at": datetime.now(timezone.utc).isoformat(), "review_approved_by": user_id}}
    )
    return {"status": "approved"}

from services.notification_service import create_notification

@router.post("/exams/{exam_id}/results/publish")
def publish_results(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    
    # 1. Verify exam ownership
    exam_query = text("""
        SELECT e.id, e.title, e.end_time, c.name as class_name 
        FROM exams e 
        JOIN classes c ON e.class_id = c.id 
        WHERE e.id = :exam_id AND c.teacher_id = :teacher_id
    """)
    exam = db.execute(exam_query, {"exam_id": exam_id, "teacher_id": user_id}).mappings().first()
    if not exam:
        raise HTTPException(status_code=403, detail="Not authorized or exam not found")
        
    # 2. Verify exam due date / end time has passed
    now = datetime.now(timezone.utc)
    if exam["end_time"]:
        end_time = exam["end_time"].replace(tzinfo=timezone.utc) if exam["end_time"].tzinfo is None else exam["end_time"]
        if now < end_time:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot publish results before the exam due date / end time ({end_time.strftime('%Y-%m-%d %H:%M:%S UTC')}) has passed."
            )

    # 3. Verify all student attempts are evaluated
    pending_attempts = db.execute(
        text("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = :exam_id AND status != 'evaluated'"),
        {"exam_id": exam_id}
    ).scalar() or 0
    if pending_attempts > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot publish results: {pending_attempts} student paper(s) are not yet evaluated. All papers must be fully evaluated before publishing."
        )

    # Check total attempts
    total_attempts = db.execute(
        text("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = :exam_id"),
        {"exam_id": exam_id}
    ).scalar() or 0
    if total_attempts == 0:
        raise HTTPException(status_code=400, detail="Cannot publish results: no student attempts exist for this exam.")

    # 4. Check if already published
    already_published = db.execute(
        text("SELECT COUNT(*) FROM exam_attempts WHERE exam_id = :exam_id AND result_published_at IS NOT NULL"),
        {"exam_id": exam_id}
    ).scalar() or 0
    if already_published == total_attempts and total_attempts > 0:
        raise HTTPException(status_code=400, detail="Results for this exam have already been published.")

    # 5. Update all attempts for this exam
    update_query = text("""
        UPDATE exam_attempts 
        SET result_published_at = NOW() 
        WHERE exam_id = :exam_id AND status = 'evaluated'
    """)
    db.execute(update_query, {"exam_id": exam_id})
    db.commit()
    
    # 6. Send notifications
    # Notify Teacher
    try:
        create_notification(
            user_id=user_id,
            title="Results Published",
            message=f"Results for '{exam['title']}' have been officially published to candidates.",
            notification_type="result",
            link=f"/teacher/exams/{exam_id}/results",
            db=db
        )
    except Exception as e:
        print(f"[NOTIFICATION ERROR] {e}")

    # Notify Students who submitted the exam
    try:
        student_rows = db.execute(
            text("SELECT DISTINCT student_id FROM exam_attempts WHERE exam_id = :exam_id"),
            {"exam_id": exam_id}
        ).mappings().all()
        for s in student_rows:
            create_notification(
                user_id=s["student_id"],
                title="Results Published",
                message=f"Your official result and diagnostic transcript for '{exam['title']}' is now published!",
                notification_type="result",
                link=f"/student/exams/{exam_id}/result",
                db=db
            )
    except Exception as e:
        print(f"[NOTIFICATION ERROR] {e}")
        
    return {"status": "published"}

