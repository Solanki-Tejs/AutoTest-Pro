from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from databases.database import get_db
from routes.dependencies import get_current_user, require_roles
from schemas.class_schema import ClassCreate
from services.class_service import (
    create_class,
    get_classes_by_teacher,
    get_class_by_code,
    request_to_join_by_code,
    get_student_memberships,
    get_join_requests_for_teacher,
    update_request_status,
    delete_class,
    get_class_students,
    remove_student_from_class,
)

router = APIRouter()


# ─── Teacher Routes ───────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_new_class(
    data: ClassCreate,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    return create_class(teacher_id, data.name, data.description, db)


@router.get("/my")
async def get_my_classes(
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    return get_classes_by_teacher(teacher_id, db)


@router.get("/requests")
async def get_all_requests(
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    return get_join_requests_for_teacher(teacher_id, db)


@router.post("/requests/{request_id}/approve")
async def approve_request(
    request_id: int,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    result = update_request_status(request_id, "approved", db)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    return result


@router.post("/requests/{request_id}/reject")
async def reject_request(
    request_id: int,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    result = update_request_status(request_id, "rejected", db)
    if not result:
        raise HTTPException(status_code=404, detail="Request not found")
    return result


@router.delete("/{class_id}")
async def remove_class(
    class_id: int,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    deleted = delete_class(class_id, teacher_id, db)
    if not deleted:
        raise HTTPException(status_code=404, detail="Class not found or not yours")
    return {"message": "Class deleted"}


@router.get("/{class_id}/students")
async def get_students(
    class_id: int,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    return get_class_students(class_id, teacher_id, db)


@router.delete("/{class_id}/students/{student_id}")
async def remove_student(
    class_id: int,
    student_id: int,
    current_user=Depends(require_roles("teacher")),
    db: Session = Depends(get_db),
):
    teacher_id = int(current_user["sub"])
    removed = remove_student_from_class(class_id, student_id, teacher_id, db)
    if not removed:
        raise HTTPException(status_code=404, detail="Student not found in this class")
    return {"message": "Student removed"}


# ─── Student Routes ───────────────────────────────────────────────────────────

@router.get("/preview/{code}")
async def preview_class_by_code(
    code: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns public class info for a join code — so students can confirm before requesting."""
    cls = get_class_by_code(code, db)
    if not cls:
        raise HTTPException(status_code=404, detail="Invalid class code")
    return cls


@router.post("/join/{code}")
async def join_class_by_code(
    code: str,
    current_user=Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(current_user["sub"])
    result = request_to_join_by_code(student_id, code, db)

    if result.get("not_found"):
        raise HTTPException(status_code=404, detail="Invalid class code")

    if result.get("already_exists"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already {result['status']}",
        )
    return result


@router.get("/my-memberships")
async def get_my_memberships(
    current_user=Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(current_user["sub"])
    return get_student_memberships(student_id, db)


@router.get("/{class_id}/student/exams")
async def get_student_class_exams(
    class_id: int,
    current_user=Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    student_id = int(current_user["sub"])
    from services.exam_service import get_published_exams_for_student
    return get_published_exams_for_student(student_id, class_id, db)
