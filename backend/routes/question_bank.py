from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any

from databases.database import get_db
from routes.dependencies import get_current_user
from services import exam_service, question_bank_service, question_generation_service
from schemas.question_bank_schema import QuestionBankResponse, QuestionUpdateSchema, PaperGenerationStatus

router = APIRouter()

@router.post("/{exam_id}/generate")
def start_paper_generation(exam_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can generate exams")
        
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to access this exam")
        
    current_status = question_bank_service.get_generation_status(exam_id)
    if current_status and current_status.get("status") == "generating":
        raise HTTPException(status_code=409, detail="Generation is already in progress for this exam")
        
    background_tasks.add_task(question_generation_service.generate_exam_paper_job, exam_id, db)
    return {"exam_id": exam_id, "status": "generating"}

@router.get("/{exam_id}/generation-status", response_model=PaperGenerationStatus)
def get_generation_status(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    status = question_bank_service.get_generation_status(exam_id)
    if not status:
        return {"exam_id": exam_id, "status": "none"}
    return status

@router.get("/{exam_id}/question-bank", response_model=QuestionBankResponse)
def get_question_bank(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    qb = question_bank_service.get_active_question_bank(exam_id)
    if not qb:
        raise HTTPException(status_code=404, detail="Question bank not found")
    return qb

@router.put("/{exam_id}/question-bank/approve")
def approve_question_bank(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    qb = question_bank_service.get_active_question_bank(exam_id)
    if not qb:
        raise HTTPException(status_code=404, detail="Question bank not found")
        
    question_bank_service.update_question_bank(exam_id, qb["version"], {"status": "approved"})
    exam_service.update_exam(exam_id, {"status": "ready"}, db)
    return {"status": "approved"}

@router.put("/{exam_id}/questions/{question_id}")
def edit_question(exam_id: str, question_id: str, updates: QuestionUpdateSchema, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam or current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if exam.get("status") == "published":
        raise HTTPException(status_code=400, detail="Cannot edit questions for a published exam")
        
    success = question_bank_service.edit_question(exam_id, question_id, updates, int(current_user["sub"]))
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"status": "success"}

@router.post("/{exam_id}/questions/{question_id}/regenerate")
def regenerate_question(exam_id: str, question_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam or current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if exam.get("status") == "published":
        raise HTTPException(status_code=400, detail="Cannot regenerate questions for a published exam")
        
    new_q = question_generation_service.regenerate_single_question(exam_id, question_id, db)
    if not new_q:
        raise HTTPException(status_code=400, detail="Failed to regenerate question")
    return new_q

@router.delete("/{exam_id}/questions/{question_id}")
def delete_question(exam_id: str, question_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam or current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if exam.get("status") == "published":
        raise HTTPException(status_code=400, detail="Cannot delete questions for a published exam")
        
    success = question_bank_service.delete_question(exam_id, question_id)
    if not success:
        raise HTTPException(status_code=404, detail="Question not found")
    return {"status": "success"}
