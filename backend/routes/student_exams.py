from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from databases.database import get_db
from routes.dependencies import require_roles
from services import student_exam_service

router = APIRouter()

@router.get("")
def get_student_exams(db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        return student_exam_service.get_student_exams(int(current_user["sub"]), db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{exam_id}/start")
def start_exam_attempt(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        attempt = student_exam_service.start_exam_attempt(int(current_user["sub"]), exam_id, db)
        return attempt
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{exam_id}/attempt")
def get_student_attempt(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        return student_exam_service.get_student_attempt(int(current_user["sub"]), exam_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{exam_id}/paper")
def get_exam_paper(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        # Validate that the student has an active attempt
        attempt = student_exam_service.start_exam_attempt(int(current_user["sub"]), exam_id, db)
        
        # Return sanitized question bank
        return student_exam_service.get_sanitized_question_bank(exam_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{exam_id}/attempts/{attempt_id}/answers")
def save_attempt_answers(exam_id: str, attempt_id: str, payload: Dict[str, Any], db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        return student_exam_service.save_attempt_answers(
            int(current_user["sub"]), 
            exam_id, 
            attempt_id,
            payload.get("answers", []), 
            db
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{exam_id}/submit")
def submit_exam(exam_id: str, payload: Dict[str, Any], background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        result = student_exam_service.submit_exam_attempt(
            int(current_user["sub"]), 
            exam_id, 
            payload.get("answers", []), 
            db
        )
        # Enqueue evaluation
        from services.evaluation_job_service import evaluate_submission
        background_tasks.add_task(evaluate_submission, str(result["id"]), exam_id)
        
        return {"status": "success", "attempt": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{exam_id}/attempts/{attempt_id}/result")
def get_attempt_result(exam_id: str, attempt_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        attempt = student_exam_service.get_student_attempt(int(current_user["sub"]), exam_id, db)
        if str(attempt["id"]) != attempt_id:
            raise HTTPException(status_code=403, detail="Attempt ID mismatch")
            
        if not attempt.get("result_published_at"):
            raise HTTPException(status_code=403, detail="Results are not published yet")
            
        return attempt
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
