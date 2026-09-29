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
        SELECT a.id, a.student_id, u.email as student_email, a.started_at, a.completed_at, a.status, a.total_marks, a.max_marks
        FROM exam_attempts a
        JOIN users u ON a.student_id = u.id
        WHERE a.exam_id = :exam_id
    """)
    result = db.execute(query, {"exam_id": exam_id}).mappings().all()
    return [dict(row) for row in result]

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
        SELECT e.id as exam_id FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    res = db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).mappings().first()
    if not res:
        raise HTTPException(status_code=403, detail="Not authorized")
        
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

@router.post("/attempts/{attempt_id}/review/approve")
def approve_review(attempt_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    auth_query = text("""
        SELECT 1 FROM exam_attempts a 
        JOIN exams e ON a.exam_id = e.id 
        JOIN classes c ON e.class_id = c.id 
        WHERE a.id = :attempt_id AND c.teacher_id = :teacher_id
    """)
    if not db.execute(auth_query, {"attempt_id": attempt_id, "teacher_id": user_id}).first():
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Maybe we can set a flag `review_approved` in PG or Mongo
    mongo_db = get_mongo_db()
    mongo_db.exam_attempt_answers.update_one(
        {"attempt_id": attempt_id},
        {"$set": {"review_approved": True, "review_approved_at": datetime.now(timezone.utc).isoformat(), "review_approved_by": user_id}}
    )
    return {"status": "approved"}

@router.post("/exams/{exam_id}/results/publish")
def publish_results(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("teacher"))):
    user_id = int(current_user["sub"])
    auth_query = text("SELECT 1 FROM exams e JOIN classes c ON e.class_id = c.id WHERE e.id = :exam_id AND c.teacher_id = :teacher_id")
    if not db.execute(auth_query, {"exam_id": exam_id, "teacher_id": user_id}).first():
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # Update all attempts for this exam
    update_query = text("""
        UPDATE exam_attempts 
        SET result_published_at = NOW() 
        WHERE exam_id = :exam_id AND status = 'evaluated'
    """)
    db.execute(update_query, {"exam_id": exam_id})
    db.commit()
    
    return {"status": "published"}
