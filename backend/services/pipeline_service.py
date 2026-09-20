from uuid import UUID
from sqlalchemy import text

from services.embedding_service import process_syllabus_pdf
from services.topic_extraction_service import extract_topics_for_syllabus

def set_status(syllabus_id: UUID, status: str, stage: str, db, error: str = None):
    db.execute(
        text("UPDATE syllabus SET status = :status, stage = :stage, error = :error WHERE id = :syllabus_id"),
        {"status": status, "stage": stage, "error": error, "syllabus_id": syllabus_id}
    )
    db.commit()

def run_syllabus_pipeline(syllabus_id: UUID, file_ref: str, db_factory):
    with db_factory() as db:
        try:
            # Stage 1 & 2: PDF Extraction and Chunking (happens within process_syllabus_pdf initially)
            set_status(syllabus_id, "PROCESSING", "PDF_EXTRACTION", db)
            
            # This handles text extraction, chunking, and embedding creation
            # We can mark it as CHUNKING and EMBEDDING as it progresses, but for now we'll do it sequentially
            
            # It's currently combined in process_syllabus_pdf
            # So we set it to EMBEDDING or CHUNKING
            set_status(syllabus_id, "PROCESSING", "CHUNKING", db)
            
            # Since process_syllabus_pdf does everything up to embedding:
            # The method itself uses db_factory, but here we can just use the same factory.
            # wait, process_syllabus_pdf takes db_factory. We can just call it.
            # Let's call it.
            pass
        except Exception as e:
            # handled later
            pass
            
    # Actually, process_syllabus_pdf opens its own session using db_factory. 
    # Let's write the whole pipeline cleanly.
    
    try:
        with db_factory() as db:
            set_status(syllabus_id, "PROCESSING", "PDF_EXTRACTION", db)
        
        # 1. process_syllabus_pdf (Handles PDF_EXTRACTION, CHUNKING, EMBEDDING)
        # Note: We should probably update process_syllabus_pdf to not take db_factory, but a session, or just let it use db_factory
        # Since it uses db_factory, we will just call it.
        # But wait, it might be better to just set stage="EMBEDDING" before calling it, 
        # since it does all those things. Let's just set it to PDF_EXTRACTION for now.
        
        with db_factory() as db:
            set_status(syllabus_id, "PROCESSING", "CHUNKING", db)
            # Actually process_syllabus_pdf does all 3. I will just run it.
        
        process_syllabus_pdf(syllabus_id, file_ref, db_factory)
        
        # 2. Topic Extraction
        with db_factory() as db:
            set_status(syllabus_id, "PROCESSING", "TOPIC_EXTRACTION", db)
            extract_topics_for_syllabus(syllabus_id, db)
            
            # 3. Mark COMPLETED
            set_status(syllabus_id, "READY", "COMPLETED", db)
            
    except Exception as e:
        with db_factory() as db:
            print(f"Pipeline failed for syllabus {syllabus_id}: {e}")
            set_status(syllabus_id, "FAILED", "FAILED", db, error=str(e))
