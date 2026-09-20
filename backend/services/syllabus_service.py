from sqlalchemy import text
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
import uuid

# ─── Table Bootstrap ──────────────────────────────────────────────────────────

def ensure_tables(db: Session):
    """
    Ensure PostgreSQL extensions and required relational tables exist.
    Also handles safe column additions to existing syllabus table.
    """
    # 1. Extensions
    db.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'))
    db.execute(text('CREATE EXTENSION IF NOT EXISTS "vector";'))

    # 2. Syllabus Table
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS syllabus (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            file_ref TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
            processing_stage VARCHAR(50),
            error_message TEXT,
            processing_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """))

    # Add any missing columns to existing syllabus table
    db.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'syllabus' AND column_name = 'status'
            ) THEN
                ALTER TABLE syllabus ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'uploaded';
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'syllabus' AND column_name = 'processing_stage'
            ) THEN
                ALTER TABLE syllabus ADD COLUMN processing_stage VARCHAR(50);
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'syllabus' AND column_name = 'error_message'
            ) THEN
                ALTER TABLE syllabus ADD COLUMN error_message TEXT;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'syllabus' AND column_name = 'processing_version'
            ) THEN
                ALTER TABLE syllabus ADD COLUMN processing_version INTEGER NOT NULL DEFAULT 1;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'syllabus' AND column_name = 'updated_at'
            ) THEN
                ALTER TABLE syllabus ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            END IF;
        END
        $$;
    """))

    # 3. Document Pages (Page level metadata)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS document_pages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE(syllabus_id, page_number)
        );
    """))

    # 4. Document Elements (Headings, paragraphs, tables, lists, images)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS document_elements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            content TEXT NOT NULL,
            metadata JSONB DEFAULT '{}'::jsonb,
            image_ref TEXT,
            visual_description TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    """))

    # 5. Document Chunks (Semantic chunking with provenance)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    """))

    # 6. Knowledge Units (Structured concept, fact, definition, formula units - NO questions)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS knowledge_units (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
            type VARCHAR(50) NOT NULL,
            name VARCHAR(255),
            structured_content JSONB NOT NULL,
            source_provenance JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    """))

    # 7. Knowledge Embeddings (pgvector 768-dim embeddings)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS knowledge_embeddings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            chunk_id UUID REFERENCES document_chunks(id) ON DELETE CASCADE,
            knowledge_unit_id UUID REFERENCES knowledge_units(id) ON DELETE CASCADE,
            embedding vector(768) NOT NULL,
            model_name VARCHAR(100) NOT NULL DEFAULT 'nomic-embed-text:latest',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
    """))

    # 8. Processing Jobs (Audit trail for asynchronous ingestion jobs)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS processing_jobs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE CASCADE,
            job_id VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            stage VARCHAR(50),
            error TEXT,
            started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE
        );
    """))

    # Indexes
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_syllabus_class_id ON syllabus(class_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_doc_pages_syllabus ON document_pages(syllabus_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_doc_elements_syllabus ON document_elements(syllabus_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_doc_chunks_syllabus ON document_chunks(syllabus_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_knowledge_units_syllabus ON knowledge_units(syllabus_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_syllabus ON knowledge_embeddings(syllabus_id);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_processing_jobs_syllabus ON processing_jobs(syllabus_id);"))

    db.commit()


# ─── Syllabus CRUD ────────────────────────────────────────────────────────────

def create_syllabus(
    class_id: int,
    title: str,
    file_ref: str,
    db: Session,
    status: str = "uploaded",
) -> dict:
    ensure_tables(db)
    result = db.execute(
        text("""
            INSERT INTO syllabus (class_id, title, file_ref, status, processing_stage)
            VALUES (:class_id, :title, :file_ref, :status, :processing_stage)
            RETURNING id, class_id, title, file_ref, status, processing_stage, error_message, created_at
        """),
        {
            "class_id": class_id,
            "title": title,
            "file_ref": file_ref,
            "status": status,
            "processing_stage": "queued" if status == "queued" else None,
        },
    )
    row = result.mappings().one()
    db.commit()
    return dict(row)


def get_syllabus_by_class(class_id: int, db: Session) -> list[dict]:
    ensure_tables(db)
    result = db.execute(
        text("""
            SELECT id, class_id, title, file_ref, status, processing_stage, error_message, created_at
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
            SELECT id, class_id, title, file_ref, status, processing_stage, error_message, created_at, updated_at
            FROM syllabus
            WHERE id = :syllabus_id
        """),
        {"syllabus_id": syllabus_id},
    )
    row = result.mappings().first()
    return dict(row) if row else None


def update_syllabus_status(
    syllabus_id: UUID,
    status: str,
    stage: str | None = None,
    error_message: str | None = None,
    db: Session = None,
) -> bool:
    """Update ingestion status, processing stage, and optional error message."""
    ensure_tables(db)
    result = db.execute(
        text("""
            UPDATE syllabus
            SET status = :status,
                processing_stage = :stage,
                error_message = :error_message,
                updated_at = NOW()
            WHERE id = :syllabus_id
        """),
        {
            "syllabus_id": syllabus_id,
            "status": status,
            "stage": stage,
            "error_message": error_message,
        },
    )
    db.commit()
    return result.rowcount > 0


def clear_derived_syllabus_data(syllabus_id: UUID, db: Session):
    """
    Delete all derived elements, chunks, knowledge units, and embeddings
    for a syllabus to ensure idempotent retry without duplicate records.
    """
    ensure_tables(db)
    db.execute(text("DELETE FROM knowledge_embeddings WHERE syllabus_id = :sid"), {"sid": syllabus_id})
    db.execute(text("DELETE FROM knowledge_units WHERE syllabus_id = :sid"), {"sid": syllabus_id})
    db.execute(text("DELETE FROM document_chunks WHERE syllabus_id = :sid"), {"sid": syllabus_id})
    db.execute(text("DELETE FROM document_elements WHERE syllabus_id = :sid"), {"sid": syllabus_id})
    db.execute(text("DELETE FROM document_pages WHERE syllabus_id = :sid"), {"sid": syllabus_id})
    db.commit()


def delete_syllabus(syllabus_id: UUID, db: Session) -> bool:
    """
    Delete syllabus record. Due to ON DELETE CASCADE on foreign keys,
    all pages, elements, chunks, knowledge units, and embeddings are automatically deleted.
    """
    ensure_tables(db)
    result = db.execute(
        text("DELETE FROM syllabus WHERE id = :syllabus_id RETURNING id"),
        {"syllabus_id": syllabus_id},
    )
    db.commit()
    return result.rowcount > 0


# ─── Status & Progress Calculation ───────────────────────────────────────────

STAGE_PROGRESS = {
    "uploaded": 5,
    "queued": 10,
    "parsing": 25,
    "extracting": 40,
    "processing_images": 55,
    "chunking": 70,
    "extracting_knowledge": 85,
    "embedding": 95,
    "completed": 100,
    "failed": 0,
}

def get_syllabus_status(syllabus_id: UUID, db: Session) -> dict | None:
    syllabus = get_syllabus_by_id(syllabus_id, db)
    if not syllabus:
        return None

    status = syllabus.get("status", "uploaded")
    stage = syllabus.get("processing_stage") or status
    progress = STAGE_PROGRESS.get(stage, STAGE_PROGRESS.get(status, 10))
    if status == "completed":
        progress = 100

    return {
        "id": syllabus["id"],
        "status": status,
        "stage": stage,
        "progress": progress,
        "error_message": syllabus.get("error_message"),
        "updated_at": syllabus.get("updated_at"),
    }
