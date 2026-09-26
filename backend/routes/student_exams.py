from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from databases.database import get_db
from routes.dependencies import require_roles
from services import student_exam_service

router = APIRouter()

@router.post("/{exam_id}/start")
def start_exam_attempt(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        attempt = student_exam_service.start_exam_attempt(int(current_user["sub"]), exam_id, db)
        return attempt
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


@router.post("/{exam_id}/submit")
def submit_exam(exam_id: str, payload: Dict[str, Any], db: Session = Depends(get_db), current_user: dict = Depends(require_roles("student"))):
    try:
        result = student_exam_service.submit_exam_attempt(
            int(current_user["sub"]), 
            exam_id, 
            payload.get("answers", []), 
            db
        )
        return {"status": "success", "attempt": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
