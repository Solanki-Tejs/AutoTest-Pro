import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, Form, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from rq import Retry

from databases.database import get_db
from routes.dependencies import get_current_user, require_roles
from schemas.syllabus_schema import SyllabusResponse, SyllabusStatusResponse
from services.syllabus_service import (
    create_syllabus,
    get_syllabus_by_class,
    get_syllabus_by_id,
    get_syllabus_status,
    update_syllabus_status,
    delete_syllabus,
)
from services.storage_service import StorageService
from core.queue import get_ingestion_queue
from services.ingestion.pipeline import run_ingestion_pipeline

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf"}


@router.post("/classes/{class_id}/syllabus", status_code=status.HTTP_201_CREATED, response_model=SyllabusResponse)
async def upload_syllabus(
    class_id: int,
    title: str = Form(...),
    file: UploadFile = File(...),
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])

    # 1. Verify class ownership
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

    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext != ".pdf" or file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Only PDF is allowed.",
        )

    # 3. Save File
    try:
        file_ref = StorageService.save_file(str(class_id), file)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save file: {e}")

    # 4. Insert Metadata with status 'queued'
    try:
        syllabus_data = create_syllabus(class_id, title, file_ref, db, status="queued")
    except Exception as e:
        StorageService.delete_file(file_ref)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save metadata: {e}")

    # 5. Enqueue Asynchronous RQ Ingestion Job
    try:
        queue = get_ingestion_queue()
        job = queue.enqueue(
            run_ingestion_pipeline,
            str(syllabus_data["id"]),
            job_timeout="15m",
            retry=Retry(max=3, interval=[10, 30, 60]),
        )
        syllabus_data["processing_stage"] = "queued"

        # Record queued job in processing_jobs audit table immediately
        db.execute(
            text("""
                INSERT INTO processing_jobs (syllabus_id, job_id, status, stage, started_at)
                VALUES (:sid, :jid, 'queued', 'queued', NOW())
            """),
            {"sid": syllabus_data["id"], "jid": job.id},
        )
        db.commit()
    except Exception as e:
        # If queueing fails, mark syllabus as failed so user is aware
        update_syllabus_status(
            syllabus_data["id"],
            status="failed",
            stage="queued",
            error_message=f"Failed to enqueue processing job: {e}",
            db=db,
        )
        syllabus_data["status"] = "failed"
        syllabus_data["error_message"] = str(e)

    return syllabus_data


@router.get("/classes/{class_id}/syllabus", response_model=list[SyllabusResponse])
async def list_syllabus(
    class_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user["sub"])
    role = current_user.get("role")

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


@router.get("/syllabus/{syllabus_id}/status", response_model=SyllabusStatusResponse)
async def get_status(
    syllabus_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve real-time processing status, stage, progress %, and error if any."""
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")

    status_data = get_syllabus_status(syllabus_id, db)
    if not status_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status unavailable")

    return status_data


@router.post("/syllabus/{syllabus_id}/retry", response_model=SyllabusResponse)
async def retry_syllabus(
    syllabus_id: UUID,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    """Retry a failed or stuck syllabus ingestion job."""
    teacher_id = int(current_user["sub"])
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")

    # Verify class ownership
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": syllabus["class_id"], "tid": teacher_id},
    ).first()
    if not cls:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this class")

    # Reset status to queued
    update_syllabus_status(syllabus_id, status="queued", stage="queued", error_message=None, db=db)

    # Re-enqueue
    try:
        queue = get_ingestion_queue()
        job = queue.enqueue(
            run_ingestion_pipeline,
            str(syllabus_id),
            job_timeout="15m",
            retry=Retry(max=3, interval=[10, 30, 60]),
        )
        db.execute(
            text("""
                INSERT INTO processing_jobs (syllabus_id, job_id, status, stage, started_at)
                VALUES (:sid, :jid, 'queued', 'queued', NOW())
            """),
            {"sid": syllabus_id, "jid": job.id},
        )
        db.commit()
    except Exception as e:
        update_syllabus_status(
            syllabus_id,
            status="failed",
            stage="queued",
            error_message=f"Failed to re-enqueue job: {e}",
            db=db,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Retry failed: {e}")

    updated = get_syllabus_by_id(syllabus_id, db)
    return updated


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

    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": teacher_id},
    ).first()

    if not cls:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this class")

    # Delete original file and any extracted image files from storage
    StorageService.delete_file(syllabus["file_ref"])

    # Delete syllabus (DB cascades delete to pages, elements, chunks, knowledge units, embeddings, jobs)
    delete_syllabus(syllabus_id, db)

    return {"message": "Syllabus and all derived knowledge data deleted successfully"}
