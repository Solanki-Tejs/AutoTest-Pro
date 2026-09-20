import os
import pymupdf
import json
import time
import urllib.request
from uuid import UUID
from sqlalchemy import text
from services.storage_service import StorageService

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")

def get_embedding(text_content: str) -> list[float]:
    url = f"{OLLAMA_BASE_URL}/api/embeddings"
    data = json.dumps({
        "model": EMBEDDING_MODEL,
        "prompt": text_content
    }).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result.get("embedding", [])
    except Exception as e:
        print(f"Error getting embedding from Ollama: {e}")
        return []

def process_syllabus_pdf(syllabus_id: UUID, file_ref: str, db_factory):
    # db_factory is a function that returns a Session
    with db_factory() as db:
        try:
            start_time = time.perf_counter()
            # 1. Clear existing chunks for this syllabus (reprocessing safety)
            db.execute(
                text("DELETE FROM document_chunks WHERE syllabus_id = :syllabus_id"),
                {"syllabus_id": syllabus_id}
            )
            db.commit()
            
            # 2. Get file path
            file_path = StorageService.get_file_path(file_ref)
            if not file_path or not file_path.exists():
                raise FileNotFoundError("Syllabus PDF file not found in storage")
                
            # 4. Extract text & Chunk
            doc = pymupdf.open(file_path)
            num_pages = len(doc)
            
            chunks_to_insert = []
            chunk_index = 0
            embed_calc_time = 0.0
            
            # Simple chunking params
            CHUNK_SIZE = 800
            OVERLAP = 100
            
            for page_num, page in enumerate(doc):
                text_content = page.get_text()
                if not text_content.strip():
                    continue
                    
                # Split text into chunks
                start = 0
                text_len = len(text_content)
                
                while start < text_len:
                    end = start + CHUNK_SIZE
                    chunk_text = text_content[start:end]
                    
                    if not chunk_text.strip():
                        start += (CHUNK_SIZE - OVERLAP)
                        continue
                        
                    # Generate embedding
                    t_emb = time.perf_counter()
                    embedding = get_embedding(chunk_text)
                    embed_calc_time += (time.perf_counter() - t_emb)
                    if not embedding:
                        continue
                    
                    metadata = {
                        "page_number": page_num + 1,
                        "chunk_index": chunk_index
                    }
                    
                    chunks_to_insert.append({
                        "syllabus_id": syllabus_id,
                        "chunk_index": chunk_index,
                        "content": chunk_text,
                        "page_number": page_num + 1,
                        "embedding": f"[{','.join(map(str, embedding))}]",
                        "metadata": json.dumps(metadata)
                    })
                    
                    chunk_index += 1
                    start += (CHUNK_SIZE - OVERLAP)
            
            doc.close()
            
            
            # 5. Insert chunks
            if chunks_to_insert:
                db_start = time.perf_counter()
                db.execute(
                    text("""
                        INSERT INTO document_chunks (syllabus_id, chunk_index, content, page_number, embedding, metadata)
                        VALUES (:syllabus_id, :chunk_index, :content, :page_number, :embedding, :metadata)
                    """),
                    chunks_to_insert
                )
                db.commit()
                db_time = time.perf_counter() - db_start
            else:
                db_time = 0.0

            total_duration = time.perf_counter() - start_time
            avg_per_chunk = (embed_calc_time / len(chunks_to_insert)) if chunks_to_insert else 0.0
            print(
                f"[TIMING] [Embedding] Extracted {num_pages} pages into {len(chunks_to_insert)} chunks. "
                f"Embedding API: {embed_calc_time:.2f}s (avg: {avg_per_chunk:.3f}s/chunk), "
                f"DB save: {db_time:.2f}s. Stage total: {total_duration:.2f}s"
            )
            
        except Exception as e:
            db.rollback()
            raise e


def search_similar_chunks(query: str, syllabus_ids: list[UUID], limit: int, db):
    if not syllabus_ids:
        return []
        
    query_embedding = get_embedding(query)
    if not query_embedding:
        return []
    query_vector_str = f"[{','.join(map(str, query_embedding))}]"
    
    # We use L2 distance `<->`
    result = db.execute(
        text("""
            SELECT id, syllabus_id, content, page_number, metadata
            FROM document_chunks
            WHERE syllabus_id = ANY(:syllabus_ids)
            ORDER BY embedding <-> :query_embedding
            LIMIT :limit
        """),
        {
            "syllabus_ids": syllabus_ids,
            "query_embedding": query_vector_str,
            "limit": limit
        }
    )
    
    return [dict(row) for row in result.mappings()]
