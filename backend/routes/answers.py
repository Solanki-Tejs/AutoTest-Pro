from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from schemas.answer_bank_schema import AnswerBankResponse, AnswerUpdateSchema, AnswerGenerationStatus, AnswerRegenerateRequest
from databases.database import get_db
from routes.dependencies import get_current_user
from services.answer_bank_service import (
    get_active_answer_bank, 
    edit_answer, 
    get_answer_generation_status,
    update_answer_bank
)
from services.answer_generation_service import generate_answers_job, regenerate_single_answer
from services.exam_service import update_exam

router = APIRouter(prefix="/api/exams/{exam_id}/answers", tags=["Answers"])

@router.post("/generate")
def generate_answers(exam_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    background_tasks.add_task(generate_answers_job, exam_id, db)
    return {"message": "Answer generation started"}

@router.get("/status", response_model=AnswerGenerationStatus)
def get_status(exam_id: str, current_user: dict = Depends(get_current_user)):
    status = get_answer_generation_status(exam_id)
    if not status:
        return AnswerGenerationStatus(exam_id=exam_id, status="NOT_STARTED")
    return status

@router.get("", response_model=AnswerBankResponse)
def get_answers(exam_id: str, current_user: dict = Depends(get_current_user)):
    ab = get_active_answer_bank(exam_id)
    if not ab:
        raise HTTPException(status_code=404, detail="Answer bank not found")
    return ab

@router.patch("/{answer_id}")
def update_answer(exam_id: str, answer_id: str, updates: AnswerUpdateSchema, current_user: dict = Depends(get_current_user)):
    success = edit_answer(exam_id, answer_id, updates.answer_key, updates.answer_text)
    if not success:
        raise HTTPException(status_code=404, detail="Answer not found or could not be updated")
    return {"message": "Answer updated"}

@router.post("/{answer_id}/regenerate")
def regenerate_answer(exam_id: str, answer_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    valid_ans = regenerate_single_answer(exam_id, answer_id, db)
    if not valid_ans:
        raise HTTPException(status_code=400, detail="Failed to regenerate answer")
    return valid_ans

@router.post("/regenerate")
def regenerate_all_answers(exam_id: str, payload: AnswerRegenerateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    background_tasks.add_task(generate_answers_job, exam_id, db, payload.mode)
    return {"message": f"Answer regeneration ({payload.mode}) started"}

@router.post("/approve")
def approve_answer_bank_endpoint(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    ab = get_active_answer_bank(exam_id)
    if not ab:
        raise HTTPException(status_code=404, detail="Answer bank not found")
        
    update_answer_bank(exam_id, {"status": "approved"})
    
    update_exam(exam_id, {"status": "ready"}, db)
    
    return {"message": "Answer bank approved and Exam is READY"}
