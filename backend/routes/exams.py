from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from databases.database import get_db
from routes.dependencies import get_current_user
from schemas.exam_schema import ExamCreate, ExamUpdate, ExamResponse
from schemas.blueprint_schema import BlueprintCreate, BlueprintResponse
from services import exam_service, exam_blueprint_service, syllabus_service

router = APIRouter()

@router.post("", response_model=ExamResponse)
def create_exam(exam_data: ExamCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create exams")
        
    # Validate selected PDFs
    available_syllabuses = syllabus_service.get_available_syllabuses_for_exam(int(current_user["sub"]), db)
    available_ids = {str(s["id"]) for s in available_syllabuses}
    
    for pdf_id in exam_data.selected_pdf_ids:
        if str(pdf_id) not in available_ids:
            raise HTTPException(status_code=400, detail=f"Syllabus {pdf_id} is not available or not fully processed")

    exam = exam_service.create_exam(exam_data, db)
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
        
    if exam_data.selected_pdf_ids is not None:
        available_syllabuses = syllabus_service.get_available_syllabuses_for_exam(int(current_user["sub"]), db)
        available_ids = {str(s["id"]) for s in available_syllabuses}
        for pdf_id in exam_data.selected_pdf_ids:
            if str(pdf_id) not in available_ids:
                raise HTTPException(status_code=400, detail=f"Syllabus {pdf_id} is not available or not fully processed")

    updated_exam = exam_service.update_exam(exam_id, exam_data, db)
    return updated_exam

@router.delete("/{exam_id}")
def delete_exam(exam_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to delete this exam")
        
    success = exam_service.delete_exam(exam_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Exam not found")
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
    exam = exam_service.get_exam_by_id(exam_id, db)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    if current_user["role"] != "teacher" or not exam_service.teacher_can_access_exam(int(current_user["sub"]), exam_id, db):
        raise HTTPException(status_code=403, detail="Not authorized to modify this exam")
        
    # Validate marks
    if not exam_blueprint_service.validate_blueprint_marks(blueprint_data, exam["total_marks"]):
        raise HTTPException(
            status_code=400,
            detail=f"Blueprint total marks do not match exam total marks ({exam['total_marks']})"
        )
        
    blueprint = exam_blueprint_service.create_or_update_blueprint(exam_id, blueprint_data)
    return blueprint
