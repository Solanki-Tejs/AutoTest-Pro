import time
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
    pipeline_start = time.perf_counter()
    print(f"\n{'='*75}")
    print(f"[PIPELINE START] Processing Syllabus ID: {syllabus_id}")
    print(f"                 File: {file_ref}")
    print(f"{'='*75}")
    
    try:
        # 1. process_syllabus_pdf (Handles PDF_EXTRACTION, CHUNKING, EMBEDDING)
        with db_factory() as db:
            set_status(syllabus_id, "PROCESSING", "PDF_EXTRACTION", db)
            set_status(syllabus_id, "PROCESSING", "CHUNKING", db)
        
        emb_start = time.perf_counter()
        process_syllabus_pdf(syllabus_id, file_ref, db_factory)
        emb_time = time.perf_counter() - emb_start
        print(f"[TIMING] >>> Stage 1/2 [Embedding & Chunking] finished in {emb_time:.2f}s")
        
        # 2. Topic Extraction
        with db_factory() as db:
            set_status(syllabus_id, "PROCESSING", "TOPIC_EXTRACTION", db)
            topic_start = time.perf_counter()
            extract_topics_for_syllabus(syllabus_id, db)
            topic_time = time.perf_counter() - topic_start
            print(f"[TIMING] >>> Stage 2/2 [Topic Extraction] finished in {topic_time:.2f}s")
            
            # 3. Mark COMPLETED
            set_status(syllabus_id, "READY", "COMPLETED", db)
            
        total_time = time.perf_counter() - pipeline_start
        print(f"{'-'*75}")
        print(f"[PIPELINE COMPLETE] Syllabus {syllabus_id} successfully processed!")
        print(f"  * Embedding & Chunking Time: {emb_time:.2f}s")
        print(f"  * Topic Extraction Time:     {topic_time:.2f}s")
        print(f"  * Total Processing Time:     {total_time:.2f}s")
        print(f"{'='*75}\n")
            
    except Exception as e:
        elapsed = time.perf_counter() - pipeline_start
        with db_factory() as db:
            print(f"[PIPELINE FAILED] Syllabus {syllabus_id} failed after {elapsed:.2f}s: {e}")
            set_status(syllabus_id, "FAILED", "FAILED", db, error=str(e))
