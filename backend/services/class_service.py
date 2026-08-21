import random
import string

from sqlalchemy import text
from sqlalchemy.orm import Session


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _generate_join_code(db: Session) -> str:
    """Generate a unique 8-char alphanumeric join code."""
    chars = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(chars, k=8))
        existing = db.execute(
            text("SELECT id FROM classes WHERE join_code = :code"),
            {"code": code},
        ).first()
        if not existing:
            return code


# ─── Table Bootstrap ──────────────────────────────────────────────────────────
# These run on first import to ensure tables exist.

def ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS classes (
            id          SERIAL PRIMARY KEY,
            name        VARCHAR(255) NOT NULL,
            description TEXT,
            teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            join_code   VARCHAR(20) NOT NULL UNIQUE,
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS class_enrollments (
            id          SERIAL PRIMARY KEY,
            class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status      VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE (class_id, student_id)
        )
    """))

    # Migrate: add join_code column to existing classes table if missing
    db.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'classes' AND column_name = 'join_code'
            ) THEN
                ALTER TABLE classes ADD COLUMN join_code VARCHAR(20) UNIQUE;
            END IF;
        END
        $$;
    """))

    db.commit()


# ─── Teacher: Class CRUD ──────────────────────────────────────────────────────

def create_class(teacher_id: int, name: str, description: str | None, db: Session) -> dict:
    ensure_tables(db)
    code = _generate_join_code(db)
    result = db.execute(
        text("""
            INSERT INTO classes (name, description, teacher_id, join_code)
            VALUES (:name, :description, :teacher_id, :join_code)
            RETURNING id, name, description, teacher_id, join_code, created_at
        """),
        {"name": name, "description": description, "teacher_id": teacher_id, "join_code": code},
    )
    row = result.mappings().one()
    db.commit()
    return dict(row)


def get_classes_by_teacher(teacher_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT
                c.id,
                c.name,
                c.description,
                c.teacher_id,
                c.join_code,
                u.name AS teacher_name,
                c.created_at,
                COUNT(r.id) FILTER (WHERE r.status = 'approved') AS student_count
            FROM classes c
            JOIN users u ON u.id = c.teacher_id
            LEFT JOIN class_enrollments r ON r.class_id = c.id
            WHERE c.teacher_id = :teacher_id
            GROUP BY c.id, u.name
            ORDER BY c.created_at DESC
        """),
        {"teacher_id": teacher_id},
    )
    return [dict(row) for row in result.mappings()]


# ─── Student: Join by Code ────────────────────────────────────────────────────

def get_class_by_code(code: str, db: Session) -> dict | None:
    """Returns basic class info for a given join code (no sensitive data)."""
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT
                c.id,
                c.name,
                c.description,
                c.join_code,
                u.name AS teacher_name,
                COUNT(r.id) FILTER (WHERE r.status = 'approved') AS student_count
            FROM classes c
            JOIN users u ON u.id = c.teacher_id
            LEFT JOIN class_enrollments r ON r.class_id = c.id
            WHERE c.join_code = :code
            GROUP BY c.id, u.name
        """),
        {"code": code.strip().upper()},
    )
    row = result.mappings().first()
    return dict(row) if row else None


def request_to_join_by_code(student_id: int, code: str, db: Session) -> dict:
    ensure_tables(db)
    # Resolve class from code
    cls = db.execute(
        text("SELECT id FROM classes WHERE join_code = :code"),
        {"code": code.strip().upper()},
    ).first()

    if not cls:
        return {"not_found": True}

    class_id = cls[0]

    # Check if already requested
    existing = db.execute(
        text("SELECT id, status FROM class_enrollments WHERE class_id = :cid AND student_id = :sid"),
        {"cid": class_id, "sid": student_id},
    ).mappings().first()

    if existing:
        return {"already_exists": True, "status": existing["status"]}

    result = db.execute(
        text("""
            INSERT INTO class_enrollments (class_id, student_id, status)
            VALUES (:class_id, :student_id, 'pending')
            RETURNING id, class_id, student_id, status, created_at
        """),
        {"class_id": class_id, "student_id": student_id},
    )
    row = result.mappings().one()
    db.commit()
    return dict(row)


def get_student_memberships(student_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT
                r.id,
                r.class_id,
                c.name AS class_name,
                c.description AS class_description,
                u.name AS teacher_name,
                r.status,
                r.created_at AS joined_at
            FROM class_enrollments r
            JOIN classes c ON c.id = r.class_id
            JOIN users u ON u.id = c.teacher_id
            WHERE r.student_id = :student_id
            ORDER BY r.created_at DESC
        """),
        {"student_id": student_id},
    )
    return [dict(row) for row in result.mappings()]


# ─── Teacher: Request Management ─────────────────────────────────────────────

def get_join_requests_for_teacher(teacher_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT
                r.id,
                r.class_id,
                c.name AS class_name,
                r.student_id,
                u.name AS student_name,
                u.email AS student_email,
                r.status,
                r.created_at
            FROM class_enrollments r
            JOIN classes c ON c.id = r.class_id
            JOIN users u ON u.id = r.student_id
            WHERE c.teacher_id = :teacher_id
            ORDER BY r.created_at DESC
        """),
        {"teacher_id": teacher_id},
    )
    return [dict(row) for row in result.mappings()]


def update_request_status(request_id: int, status: str, db: Session) -> dict:
    ensure_tables(db)
    result = db.execute(
        text("""
            UPDATE class_enrollments
            SET status = :status
            WHERE id = :id
            RETURNING id, class_id, student_id, status, created_at
        """),
        {"id": request_id, "status": status},
    )
    row = result.mappings().first()
    db.commit()
    if not row:
        return {}
    return dict(row)


def delete_class(class_id: int, teacher_id: int, db: Session) -> bool:
    ensure_tables(db)
    result = db.execute(
        text("DELETE FROM classes WHERE id = :id AND teacher_id = :teacher_id RETURNING id"),
        {"id": class_id, "teacher_id": teacher_id},
    )
    db.commit()
    return result.rowcount > 0


# ─── Teacher: Student Management ─────────────────────────────────────────────

def get_class_students(class_id: int, teacher_id: int, db: Session) -> list[dict]:
    """Returns all approved students for a class owned by this teacher."""
    ensure_tables(db)
    # Verify ownership first
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": teacher_id},
    ).first()
    if not cls:
        return []

    result = db.execute(
        text("""
            SELECT
                e.id       AS enrollment_id,
                u.id       AS student_id,
                u.name     AS student_name,
                u.email    AS student_email,
                e.status,
                e.created_at AS joined_at
            FROM class_enrollments e
            JOIN users u ON u.id = e.student_id
            WHERE e.class_id = :class_id
              AND e.status = 'approved'
            ORDER BY u.name ASC
        """),
        {"class_id": class_id},
    )
    return [dict(row) for row in result.mappings()]


def remove_student_from_class(class_id: int, student_id: int, teacher_id: int, db: Session) -> bool:
    """Removes a student's enrollment from a class owned by this teacher."""
    ensure_tables(db)
    # Verify ownership
    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND teacher_id = :tid"),
        {"cid": class_id, "tid": teacher_id},
    ).first()
    if not cls:
        return False

    result = db.execute(
        text("""
            DELETE FROM class_enrollments
            WHERE class_id = :class_id AND student_id = :student_id
            RETURNING id
        """),
        {"class_id": class_id, "student_id": student_id},
    )
    db.commit()
    return result.rowcount > 0

