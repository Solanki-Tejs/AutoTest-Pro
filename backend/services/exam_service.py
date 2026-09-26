from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from schemas.exam_schema import ExamCreate, ExamUpdate

_tables_ensured = False

def ensure_tables(db: Session):
    global _tables_ensured
    if _tables_ensured:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS exams (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            total_marks INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            difficulty VARCHAR(20) NOT NULL,
            selected_pdf_ids UUID[] NOT NULL,
            start_time TIMESTAMP NULL,
            end_time TIMESTAMP NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    db.commit()
    _tables_ensured = True


def create_exam(exam_data: ExamCreate, db: Session) -> dict:
    ensure_tables(db)
    
    query = text("""
        INSERT INTO exams (class_id, title, total_marks, duration_minutes, difficulty, selected_pdf_ids, start_time, end_time)
        VALUES (:class_id, :title, :total_marks, :duration_minutes, :difficulty, CAST(:selected_pdf_ids AS uuid[]), :start_time, :end_time)
        RETURNING id, class_id, title, total_marks, duration_minutes, difficulty, selected_pdf_ids, start_time, end_time, status, created_at
    """)
    
    result = db.execute(query, {
        "class_id": exam_data.class_id,
        "title": exam_data.title,
        "total_marks": exam_data.total_marks,
        "duration_minutes": exam_data.duration_minutes,
        "difficulty": exam_data.difficulty,
        "selected_pdf_ids": [str(pdf_id) for pdf_id in exam_data.selected_pdf_ids],
        "start_time": exam_data.start_time,
        "end_time": exam_data.end_time
    })
    
    row = result.mappings().one()
    db.commit()
    return dict(row)


def get_exams_by_teacher(teacher_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    query = text("""
        SELECT e.id, e.class_id, e.title, e.total_marks, e.duration_minutes, e.difficulty, e.selected_pdf_ids, e.start_time, e.end_time, e.status, e.created_at, c.name as class_name
        FROM exams e
        JOIN classes c ON e.class_id = c.id
        WHERE c.teacher_id = :teacher_id
        ORDER BY e.created_at DESC
    """)
    result = db.execute(query, {"teacher_id": teacher_id})
    return [dict(row) for row in result.mappings()]


def get_exam_by_id(exam_id: str, db: Session) -> dict | None:
    ensure_tables(db)
    query = text("""
        SELECT e.id, e.class_id, e.title, e.total_marks, e.duration_minutes, e.difficulty, e.selected_pdf_ids, e.start_time, e.end_time, e.status, e.created_at
        FROM exams e
        WHERE e.id = :exam_id
    """)
    result = db.execute(query, {"exam_id": exam_id})
    row = result.mappings().first()
    return dict(row) if row else None


def update_exam(exam_id: str, exam_data: ExamUpdate, db: Session) -> dict | None:
    ensure_tables(db)
    # Build dynamic update query
    updates = []
    params = {"exam_id": exam_id}
    
    update_fields = exam_data if isinstance(exam_data, dict) else exam_data.model_dump(exclude_unset=True)
    if not update_fields:
        return get_exam_by_id(exam_id, db)
        
    for key, value in update_fields.items():
        if key == "selected_pdf_ids":
            updates.append(f"{key} = CAST(:{key} AS uuid[])")
            params[key] = [str(pdf_id) for pdf_id in value]
        else:
            updates.append(f"{key} = :{key}")
            params[key] = value
            
    query = text(f"""
        UPDATE exams
        SET {", ".join(updates)}
        WHERE id = :exam_id
        RETURNING id, class_id, title, total_marks, duration_minutes, difficulty, selected_pdf_ids, start_time, end_time, status, created_at
    """)
    
    result = db.execute(query, params)
    row = result.mappings().first()
    db.commit()
    return dict(row) if row else None


def delete_exam(exam_id: str, db: Session) -> bool:
    ensure_tables(db)
    query = text("DELETE FROM exams WHERE id = :exam_id")
    result = db.execute(query, {"exam_id": exam_id})
    db.commit()
    return result.rowcount > 0

def teacher_can_access_exam(teacher_id: int, exam_id: str, db: Session) -> bool:
    ensure_tables(db)
    query = text("""
        SELECT 1
        FROM exams e
        JOIN classes c ON e.class_id = c.id
        WHERE e.id = :exam_id AND c.teacher_id = :teacher_id
    """)
    result = db.execute(query, {"exam_id": exam_id, "teacher_id": teacher_id})
    return result.first() is not None

def get_published_exams_for_student(student_id: int, class_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    query = text("""
        SELECT e.id, e.class_id, e.title, e.total_marks, e.duration_minutes, e.difficulty, e.start_time, e.end_time, e.status, e.created_at
        FROM exams e
        JOIN class_enrollments cm ON e.class_id = cm.class_id
        WHERE e.class_id = :class_id 
          AND cm.student_id = :student_id 
          AND cm.status = 'approved'
          AND e.status = 'published'
        ORDER BY e.start_time ASC, e.created_at DESC
    """)
    result = db.execute(query, {"class_id": class_id, "student_id": student_id})
    return [dict(row) for row in result.mappings()]
