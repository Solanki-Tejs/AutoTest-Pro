from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID
import uuid

_tables_ensured = False

# ─── Table Bootstrap ──────────────────────────────────────────────────────────
# These run on first import to ensure tables exist.

def ensure_tables(db: Session):
    global _tables_ensured
    if _tables_ensured:
        return
    # Ensure classes table exists first (class_service handles it, but just in case)
    # The requirement is that syllabus references classes.id
    # However, classes.id is an INTEGER, not a UUID.
    # The prompt said: "class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE"
    # But wait! I checked `class_service.py` and `classes` table has: `id SERIAL PRIMARY KEY`
    # So `class_id` must be `INTEGER`, NOT `UUID`.
    
    db.execute(text("""
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    """))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS syllabus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            file_ref TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'PENDING',
            stage VARCHAR(50) DEFAULT 'PENDING',
            error TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """))
    
    # In case the table already exists, rename and add columns safely
    db.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='syllabus' AND column_name='embedding_status') THEN
                ALTER TABLE syllabus RENAME COLUMN embedding_status TO status;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='syllabus' AND column_name='embedding_error') THEN
                ALTER TABLE syllabus RENAME COLUMN embedding_error TO error;
            END IF;
        END $$;
    """))
    db.execute(text("""
        ALTER TABLE syllabus ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';
    """))
    db.execute(text("""
        ALTER TABLE syllabus ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'PENDING';
    """))
    db.execute(text("""
        ALTER TABLE syllabus ADD COLUMN IF NOT EXISTS error TEXT;
    """))
    db.commit()

    try:
        db.execute(text("""
            CREATE EXTENSION IF NOT EXISTS vector;
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                page_number INTEGER,
                embedding VECTOR(768),
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Warning: Failed to initialize pgvector extension or document_chunks table: {e}")
        
    _tables_ensured = True


# ─── Syllabus CRUD ────────────────────────────────────────────────────────────

def create_syllabus(class_id: int, title: str, file_ref: str, db: Session) -> dict:
    ensure_tables(db)
    result = db.execute(
        text("""
            INSERT INTO syllabus (class_id, title, file_ref, status, stage)
            VALUES (:class_id, :title, :file_ref, 'PENDING', 'PENDING')
            RETURNING id, class_id, title, file_ref, status, stage, error, created_at
        """),
        {"class_id": class_id, "title": title, "file_ref": file_ref},
    )
    row = result.mappings().one()
    db.commit()
    return dict(row)


def get_syllabus_by_class(class_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT id, class_id, title, file_ref, status, stage, error, created_at
            FROM syllabus
            WHERE class_id = :class_id
            ORDER BY created_at DESC
        """),
        {"class_id": class_id},
    )
    return [dict(row) for row in result.mappings()]


def get_syllabus_by_id(syllabus_id: UUID, db: Session) -> dict | None:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT id, class_id, title, file_ref, status, stage, error, created_at
            FROM syllabus
            WHERE id = :syllabus_id
        """),
        {"syllabus_id": syllabus_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


def delete_syllabus(syllabus_id: UUID, db: Session) -> bool:
    ensure_tables(db)
    result = db.execute(
        text("DELETE FROM syllabus WHERE id = :syllabus_id RETURNING id"),
        {"syllabus_id": syllabus_id},
    )
    db.commit()
    return result.rowcount > 0

def get_available_syllabuses_for_exam(teacher_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    
    # Get all READY syllabuses for classes owned by this teacher
    query = text("""
        SELECT s.id, s.class_id, s.title, s.file_ref, s.status, s.stage, s.error, s.created_at, c.name as class_name
        FROM syllabus s
        JOIN classes c ON s.class_id = c.id
        WHERE c.teacher_id = :teacher_id AND s.status = 'READY'
    """)
    result = db.execute(query, {"teacher_id": teacher_id})
    syllabuses = [dict(row) for row in result.mappings()]
    
    if not syllabuses:
        return []
        
    # Also check if MongoDB mapping exists
    try:
        from databases.mongo import get_mongo_db
        mongo_db = get_mongo_db()
        syllabus_ids = [str(s["id"]) for s in syllabuses]
        
        mappings = mongo_db.syllabus_topic_mapping.find(
            {"uploaded_syllabus_id": {"$in": syllabus_ids}},
            {"uploaded_syllabus_id": 1}
        )
        mapped_ids = {m["uploaded_syllabus_id"] for m in mappings}
        
        return [s for s in syllabuses if str(s["id"]) in mapped_ids]
    except Exception as e:
        print(f"Error checking MongoDB for syllabus mapping: {e}")
        # If MongoDB check fails, maybe return empty or the full list? Let's be strict.
        return []
