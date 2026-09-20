import json
import logging
from pathlib import Path
from uuid import UUID
from typing import Optional
from sqlalchemy import text
from databases.database import SessionLocal
from services.syllabus_service import (
    update_syllabus_status,
    clear_derived_syllabus_data,
    get_syllabus_by_id,
)
from services.storage_service import StorageService
from services.ingestion.pdf_parser import PDFParser
from services.ingestion.visual_processor import VisualProcessor
from services.ingestion.semantic_chunker import SemanticChunker
from services.ingestion.knowledge_extractor import KnowledgeExtractor
from services.ingestion.embedding_service import EmbeddingService

logger = logging.getLogger("ingestion.pipeline")

def run_ingestion_pipeline(syllabus_id_str: str, job_id: Optional[str] = None):
    """
    Asynchronous ingestion pipeline executed by the RQ worker.
    Processes uploaded PDF from raw bytes to structured knowledge and embeddings.
    Strictly performs knowledge ingestion (NO question generation).
    """
    syllabus_id = UUID(syllabus_id_str)

    # Detect RQ job ID if executing inside an RQ worker
    if not job_id:
        try:
            from rq import get_current_job
            rq_job = get_current_job()
            if rq_job:
                job_id = rq_job.id
        except Exception:
            pass

    logger.info(f"[INGESTION] Starting pipeline for syllabus {syllabus_id} (job {job_id})")

    db = SessionLocal()
    current_stage = "initializing"

    try:
        # Fetch syllabus details
        syllabus = get_syllabus_by_id(syllabus_id, db)
        if not syllabus:
            logger.error(f"[INGESTION] Syllabus {syllabus_id} not found in database.")
            return

        file_ref = syllabus["file_ref"]
        class_id = str(syllabus["class_id"])
        file_path = StorageService.get_file_path(file_ref)

        if not file_path or not file_path.exists():
            raise FileNotFoundError(f"Underlying PDF file missing for reference {file_ref}")

        # Record processing job start (updates the 'queued' record created at upload, or inserts if not present)
        if job_id:
            res = db.execute(
                text("""
                    UPDATE processing_jobs
                    SET status = 'processing', stage = 'parsing', started_at = NOW()
                    WHERE job_id = :jid
                """),
                {"jid": job_id},
            )
            if res.rowcount == 0:
                db.execute(
                    text("""
                        INSERT INTO processing_jobs (syllabus_id, job_id, status, stage, started_at)
                        VALUES (:sid, :jid, 'processing', 'parsing', NOW())
                    """),
                    {"sid": syllabus_id, "jid": job_id},
                )
            db.commit()

        # Idempotency: clear any previous partial/derived artifacts before reprocessing
        clear_derived_syllabus_data(syllabus_id, db)

        # ─── Stage 1: Parsing ────────────────────────────────────────────────
        current_stage = "parsing"
        update_syllabus_status(syllabus_id, status="processing", stage=current_stage, db=db)
        logger.info(f"[INGESTION] [{syllabus_id}] Stage: parsing PDF structure...")

        parser = PDFParser(output_dir=file_path.parent)
        parse_result = parser.parse(file_path, class_id=class_id, syllabus_id=syllabus_id_str)
        num_pages = parse_result["num_pages"]
        raw_elements = parse_result["elements"]

        # Insert document pages
        page_id_map = {}
        for page_num in range(1, num_pages + 1):
            row = db.execute(
                text("""
                    INSERT INTO document_pages (syllabus_id, page_number)
                    VALUES (:sid, :pnum)
                    RETURNING id, page_number
                """),
                {"sid": syllabus_id, "pnum": page_num},
            ).mappings().one()
            page_id_map[page_num] = row["id"]
        db.commit()

        # ─── Stage 2: Visual Elements Processing (LLaVA 7B) ───────────────────
        current_stage = "processing_images"
        update_syllabus_status(syllabus_id, status="processing", stage=current_stage, db=db)
        logger.info(f"[INGESTION] [{syllabus_id}] Stage: processing visual elements...")

        visual_processor = VisualProcessor()
        elements = visual_processor.process_visual_elements(raw_elements, storage_dir=Path("storage"))

        # Insert document elements with page references
        for elem in elements:
            page_num = elem.get("page_number", 1)
            page_id = page_id_map.get(page_num, page_id_map.get(1))

            res = db.execute(
                text("""
                    INSERT INTO document_elements (
                        syllabus_id, page_id, type, content, metadata, image_ref, visual_description
                    )
                    VALUES (:sid, :pid, :type, :content, :metadata, :iref, :vdesc)
                    RETURNING id
                """),
                {
                    "sid": syllabus_id,
                    "pid": page_id,
                    "type": elem["type"],
                    "content": elem["content"],
                    "metadata": json.dumps(elem.get("metadata", {})),
                    "iref": elem.get("image_ref"),
                    "vdesc": elem.get("visual_description"),
                },
            ).mappings().one()
            elem["id"] = res["id"]
        db.commit()
        logger.info(f"[INGESTION] [{syllabus_id}] Persisted {len(elements)} document elements.")

        # ─── Stage 3: Semantic Chunking ───────────────────────────────────────
        current_stage = "chunking"
        update_syllabus_status(syllabus_id, status="processing", stage=current_stage, db=db)
        logger.info(f"[INGESTION] [{syllabus_id}] Stage: creating semantic chunks...")

        chunker = SemanticChunker()
        chunk_dicts = chunker.chunk_elements(elements, syllabus_id=syllabus_id_str)

        persisted_chunks = []
        for c in chunk_dicts:
            row = db.execute(
                text("""
                    INSERT INTO document_chunks (syllabus_id, chunk_index, content, metadata)
                    VALUES (:sid, :cidx, :content, :meta)
                    RETURNING id, chunk_index, content, metadata
                """),
                {
                    "sid": syllabus_id,
                    "cidx": c["chunk_index"],
                    "content": c["content"],
                    "meta": json.dumps(c.get("metadata", {})),
                },
            ).mappings().one()
            persisted_chunks.append(dict(row))
        db.commit()
        logger.info(f"[INGESTION] [{syllabus_id}] Persisted {len(persisted_chunks)} semantic chunks.")

        # ─── Stage 4: Knowledge Extraction (Mistral 7B) ──────────────────────
        current_stage = "extracting_knowledge"
        update_syllabus_status(syllabus_id, status="processing", stage=current_stage, db=db)
        logger.info(f"[INGESTION] [{syllabus_id}] Stage: extracting structured knowledge units...")

        knowledge_extractor = KnowledgeExtractor()
        persisted_units = []

        for chunk_idx, chunk in enumerate(persisted_chunks, start=1):
            units = knowledge_extractor.extract_from_chunk(chunk, syllabus_id=syllabus_id_str)
            for u in units:
                row = db.execute(
                    text("""
                        INSERT INTO knowledge_units (
                            syllabus_id, chunk_id, type, name, structured_content, source_provenance
                        )
                        VALUES (:sid, :cid, :type, :name, :content, :prov)
                        RETURNING id, type, name, structured_content
                    """),
                    {
                        "sid": syllabus_id,
                        "cid": u["chunk_id"],
                        "type": u["type"],
                        "name": u["name"],
                        "content": json.dumps(u["structured_content"]),
                        "prov": json.dumps(u["source_provenance"]),
                    },
                ).mappings().one()
                persisted_units.append(dict(row))
            db.commit()
            if chunk_idx % 10 == 0 or chunk_idx == len(persisted_chunks):
                logger.info(f"[INGESTION] [{syllabus_id}] Extracted and saved knowledge for {chunk_idx}/{len(persisted_chunks)} chunks.")
        logger.info(f"[INGESTION] [{syllabus_id}] Persisted {len(persisted_units)} structured knowledge units.")

        # ─── Stage 5: Embeddings Generation (nomic-embed-text:latest) ─────────
        current_stage = "embedding"
        update_syllabus_status(syllabus_id, status="processing", stage=current_stage, db=db)
        logger.info(f"[INGESTION] [{syllabus_id}] Stage: generating pgvector embeddings...")

        embedding_service = EmbeddingService()
        embeddings_stored = 0

        # Embed semantic chunks
        for chunk in persisted_chunks:
            vec = embedding_service.generate_embedding(chunk["content"])
            if vec:
                db.execute(
                    text("""
                        INSERT INTO knowledge_embeddings (syllabus_id, chunk_id, embedding, model_name)
                        VALUES (:sid, :cid, :vec, :model)
                    """),
                    {
                        "sid": syllabus_id,
                        "cid": chunk["id"],
                        "vec": str(vec),
                        "model": embedding_service.model,
                    },
                )
                embeddings_stored += 1

        # Embed knowledge units
        for unit in persisted_units:
            content_str = json.dumps(unit["structured_content"])
            embed_text = f"{unit['name']}: {content_str}"
            vec = embedding_service.generate_embedding(embed_text)
            if vec:
                db.execute(
                    text("""
                        INSERT INTO knowledge_embeddings (syllabus_id, knowledge_unit_id, embedding, model_name)
                        VALUES (:sid, :kid, :vec, :model)
                    """),
                    {
                        "sid": syllabus_id,
                        "kid": unit["id"],
                        "vec": str(vec),
                        "model": embedding_service.model,
                    },
                )
                embeddings_stored += 1

        db.commit()
        logger.info(f"[INGESTION] [{syllabus_id}] Successfully stored {embeddings_stored} embeddings in pgvector.")

        # ─── Stage 6: Completion ─────────────────────────────────────────────
        update_syllabus_status(syllabus_id, status="completed", stage="completed", error_message=None, db=db)

        if job_id:
            db.execute(
                text("""
                    UPDATE processing_jobs
                    SET status = 'completed', stage = 'completed', completed_at = NOW()
                    WHERE job_id = :jid
                """),
                {"jid": job_id},
            )
            db.commit()

        logger.info(f"[INGESTION] Ingestion pipeline successfully completed for syllabus {syllabus_id}.")

    except Exception as e:
        logger.error(f"[INGESTION] Pipeline error at stage '{current_stage}' for syllabus {syllabus_id}: {e}", exc_info=True)
        safe_error = f"Ingestion failed during {current_stage}: {str(e)[:300]}"
        update_syllabus_status(syllabus_id, status="failed", stage=current_stage, error_message=safe_error, db=db)

        if job_id:
            res = db.execute(
                text("""
                    UPDATE processing_jobs
                    SET status = 'failed', stage = :stage, error = :err, completed_at = NOW()
                    WHERE job_id = :jid
                """),
                {"jid": job_id, "stage": current_stage, "err": safe_error},
            )
            if res.rowcount == 0:
                db.execute(
                    text("""
                        INSERT INTO processing_jobs (syllabus_id, job_id, status, stage, error, started_at, completed_at)
                        VALUES (:sid, :jid, 'failed', :stage, :err, NOW(), NOW())
                    """),
                    {"sid": syllabus_id, "jid": job_id, "stage": current_stage, "err": safe_error},
                )
            db.commit()

    finally:
        db.close()
