from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List
from sqlalchemy import text

from databases.database import get_db
from routes.dependencies import get_current_user
from schemas.exam_schema import ExamCreate, ExamUpdate, ExamResponse, ExamPublishRequest
from schemas.blueprint_schema import BlueprintCreate, BlueprintResponse
from services import exam_service, exam_blueprint_service, syllabus_service
from services.audit_service import log_audit_event

router = APIRouter()

@router.post("", response_model=ExamResponse)
def create_exam(exam_data: ExamCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create exams")
        
    # Validate class ownership
    class_query = text("SELECT 1 FROM classes WHERE id = :class_id AND teacher_id = :teacher_id")
    class_exists = db.execute(class_query, {"class_id": exam_data.class_id, "teacher_id": int(current_user["sub"])}).first()
    if not class_exists:
        raise HTTPException(status_code=403, detail="Not authorized to create an exam for this class")
        
    # Validate selected PDFs
    available_syllabuses = syllabus_service.get_available_syllabuses_for_exam(int(current_user["sub"]), db)
    available_ids = {str(s["id"]) for s in available_syllabuses}
    
    for pdf_id in exam_data.selected_pdf_ids:
        if str(pdf_id) not in available_ids:
            raise HTTPException(status_code=400, detail=f"Syllabus {pdf_id} is not available or not fully processed")

    exam = exam_service.create_exam(exam_data, db)
    log_audit_event(int(current_user["sub"]), "EXAM_CREATED", "EXAM", str(exam["id"]))
    return exam

@router.get("", response_model=List[ExamResponse])
def get_teacher_exams(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can view their exams")
    
    return exam_service.get_exams_by_teacher(int(current_user["sub"]), db)

@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] == "teacher" and not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to access this exam")
        
    return exam

@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(exam_id: str, exam_data: ExamUpdate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to update this exam")

    if exam["status"] == "published":
        raise HTTPException(status_code=400, detail="Cannot modify a published exam")
        
    if exam_data.selected_pdf_ids is not None:
        available_syllabuses = syllabus_service.get_available_syllabuses_for_exam(int(current_user["sub"]), db)
        available_ids = {str(s["id"]) for s in available_syllabuses}
        for pdf_id in exam_data.selected_pdf_ids:
            if str(pdf_id) not in available_ids:
                raise HTTPException(status_code=400, detail=f"Syllabus {pdf_id} is not available or not fully processed")

    updated_exam = exam_service.update_exam(exam_id, exam_data, db)
    log_audit_event(int(current_user["sub"]), "EXAM_UPDATED", "EXAM", exam_id, exam_data.model_dump(exclude_unset=True))
    return updated_exam

from services import exam_publish_service
from services.audit_service import log_audit_event

@router.post("/{exam_id}/publish", response_model=ExamResponse)
def publish_exam(exam_id: str, payload: ExamPublishRequest, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(user_id, exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to publish this exam")

    try:
        updated_exam = exam_publish_service.validate_and_publish_exam(
            exam_id, 
            user_id, 
            payload.start_time, 
            payload.end_time, 
            db
        )
        log_audit_event(user_id, "EXAM_PUBLISHED", "EXAM", exam_id, {"start_time": str(payload.start_time), "end_time": str(payload.end_time)})
        return updated_exam
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{exam_id}")
def delete_exam(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(user_id, exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to delete this exam")
        
    success = exam_service.delete_exam(exam_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Exam not found")
    log_audit_event(user_id, "EXAM_DELETED", "EXAM", exam_id)
    return {"status": "success"}

@router.get("/{exam_id}/blueprint", response_model=BlueprintResponse)
def get_exam_blueprint(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] == "teacher" and not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to access this exam")
        
    blueprint = exam_blueprint_service.get_blueprint(exam_id)
    if not blueprint:
        raise HTTPException(status_code=404, detail="Blueprint not found")
    return blueprint

@router.post("/{exam_id}/blueprint", response_model=BlueprintResponse)
def save_exam_blueprint(exam_id: str, blueprint_data: BlueprintCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(user_id, exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to modify this exam")
        
    # Validate marks
    if not exam_blueprint_service.validate_blueprint_marks(blueprint_data, exam["total_marks"]):
        raise HTTPException(
            status_code=400,
            detail=f"Blueprint total marks do not match exam total marks ({exam['total_marks']})"
        )
        
    try:
        blueprint = exam_blueprint_service.create_or_update_blueprint(exam_id, blueprint_data)
        log_audit_event(user_id, "BLUEPRINT_SAVED", "BLUEPRINT", exam_id, {"version": blueprint.version})
        return blueprint
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
