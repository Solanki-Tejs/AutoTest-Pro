from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from sqlalchemy import text

from databases.database import get_db
from routes.dependencies import get_current_user, require_roles
from schemas.topic_schema import SyllabusTopicMappingResponse
from services.topic_extraction_service import extract_topics_for_syllabus, get_topics_for_syllabus
from services.syllabus_service import get_syllabus_by_id

router = APIRouter()

@router.get("/syllabus/{uploaded_syllabus_id}/topics", response_model=SyllabusTopicMappingResponse)
async def get_topics(
    uploaded_syllabus_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = int(current_user["sub"])
    role = current_user.get("role")
    
    # 1. Verify syllabus exists
    syllabus = get_syllabus_by_id(uploaded_syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
        
    class_id = syllabus["class_id"]
    
    # 2. Verify authorization
    if role == "teacher":
        cls = db.execute(
            text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
            {"cid": class_id, "tid": user_id},
        ).first()
        if not cls:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this class")
    elif role == "student":
        enrollment = db.execute(
            text("SELECT id FROM class_enrollments WHERE class_id = :cid AND student_id = :sid AND status = 'approved'"),
            {"cid": class_id, "sid": user_id},
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized role")
        
    # 3. Check status
    if syllabus.get("status") != "READY":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Syllabus processing is not yet complete")
        
    # 4. Get topic mapping
    mapping = get_topics_for_syllabus(uploaded_syllabus_id)
    if not mapping:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topics not yet extracted for this syllabus")
        
    return mapping
