from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, Form, File, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from uuid import UUID

from databases.database import get_db, SessionLocal
from routes.dependencies import get_current_user, require_roles
from schemas.syllabus_schema import SyllabusResponse
from services.class_service import get_student_memberships
from services.syllabus_service import (
    create_syllabus,
    get_syllabus_by_class,
    get_syllabus_by_id,
    delete_syllabus,
)
from services.storage_service import StorageService
from services.pipeline_service import run_syllabus_pipeline

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf"}

@router.post("/classes/{class_id}/syllabus", status_code=status.HTTP_201_CREATED, response_model=SyllabusResponse)
async def upload_syllabus(
    class_id: int,
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    
    # 1. Verify class ownership
    # We can use a query or existing method to check if the teacher owns this class
    from sqlalchemy import text
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": teacher_id},
    ).first()
    
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not own this class or it doesn't exist.",
        )
    
    # 2. Validate file
    if not title.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title is required")
        
    import os
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext != ".pdf" or file.content_type != "application/pdf":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file format. Only PDF is allowed.")
    
    # 3. Save File
    try:
        file_ref = StorageService.save_file(str(class_id), file)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save file: {e}")
        
    # 4. Insert Metadata
    try:
        syllabus_data = create_syllabus(class_id, title, file_ref, db)
        background_tasks.add_task(run_syllabus_pipeline, syllabus_data["id"], file_ref, SessionLocal)
        return syllabus_data
    except Exception as e:
        StorageService.delete_file(file_ref)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save metadata")


@router.get("/classes/{class_id}/syllabus", response_model=list[SyllabusResponse])
async def list_syllabus(
    class_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user["sub"])
    role = current_user.get("role")
    
    from sqlalchemy import text
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
        
    return get_syllabus_by_class(class_id, db)


@router.get("/syllabus/{syllabus_id}/file")
async def download_syllabus(
    syllabus_id: UUID,
    download: bool = False,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
        
    class_id = syllabus["class_id"]
    user_id = int(current_user["sub"])
    role = current_user.get("role")
    
    # Verify authorization (teacher owner or enrolled student)
    from sqlalchemy import text
    if role == "teacher":
        cls = db.execute(
            text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
            {"cid": class_id, "tid": user_id},
        ).first()
        if not cls:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
    elif role == "student":
        enrollment = db.execute(
            text("SELECT id FROM class_enrollments WHERE class_id = :cid AND student_id = :sid AND status = 'approved'"),
            {"cid": class_id, "sid": user_id},
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized role")

    # Serve the file
    file_path = StorageService.get_file_path(syllabus["file_ref"])
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File is missing from storage")
        
    if download:
        return FileResponse(path=file_path, filename=file_path.name, content_disposition_type="attachment")
    else:
        return FileResponse(path=file_path, media_type="application/pdf", content_disposition_type="inline")


@router.delete("/syllabus/{syllabus_id}")
async def remove_syllabus(
    syllabus_id: UUID,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
        
    class_id = syllabus["class_id"]
    
    # Verify class ownership
    from sqlalchemy import text
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": teacher_id},
    ).first()
    
    if not cls:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this class")
        
    # Delete from storage first
    StorageService.delete_file(syllabus["file_ref"])
    
    # Delete metadata
    delete_syllabus(syllabus_id, db)
    
    return {"message": "Syllabus deleted successfully"}


@router.get("/syllabus/{syllabus_id}/status")
async def get_syllabus_status(
    syllabus_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
        
    class_id = syllabus["class_id"]
    user_id = int(current_user["sub"])
    role = current_user.get("role")
    
    # Verify authorization
    from sqlalchemy import text
    if role == "teacher":
        cls = db.execute(
            text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
            {"cid": class_id, "tid": user_id},
        ).first()
        if not cls:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
    elif role == "student":
        enrollment = db.execute(
            text("SELECT id FROM class_enrollments WHERE class_id = :cid AND student_id = :sid AND status = 'approved'"),
            {"cid": class_id, "sid": user_id},
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized role")
        
    return {
        "uploaded_syllabus_id": syllabus["id"],
        "status": syllabus.get("status", "PENDING"),
        "stage": syllabus.get("stage", "PENDING"),
        "error": syllabus.get("error")
    }

@router.post("/syllabus/{syllabus_id}/retry")
async def retry_syllabus(
    syllabus_id: UUID,
    background_tasks: BackgroundTasks,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
        
    class_id = syllabus["class_id"]
    user_id = int(current_user["sub"])
    
    # Verify authorization
    from sqlalchemy import text
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": user_id},
    ).first()
    if not cls:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this class")
        
    # Reset status
    db.execute(
        text("UPDATE syllabus SET status = 'PENDING', stage = 'PENDING', error = NULL WHERE id = :sid"),
        {"sid": syllabus_id}
    )
    db.commit()
    
    # Start pipeline
    background_tasks.add_task(run_syllabus_pipeline, syllabus["id"], syllabus["file_ref"], SessionLocal)
    
    return {"message": "Pipeline retry initiated"}
