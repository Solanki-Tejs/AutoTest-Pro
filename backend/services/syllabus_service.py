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
