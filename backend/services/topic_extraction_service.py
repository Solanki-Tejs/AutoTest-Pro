import json
import time
import os
import urllib.request
import urllib.error
import re
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

from databases.mongo import syllabus_topic_mapping_collection
from schemas.topic_schema import SyllabusTopicMappingBase

# ─── Configuration ────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_API_URL = f"{OLLAMA_BASE_URL}/api/generate"

def resolve_ollama_model(preferred: str = None) -> str:
    """
    Resolve which LLM model to use with local Ollama.
    1. Check preferred or OLLAMA_LLM_MODEL env var (defaults to mistral:7b).
    2. Query Ollama /api/tags to verify model availability.
    3. If the model is not installed, fallback to an installed text model (e.g. mistral:7b)
       to prevent HTTP 404 errors.
    """
    target = (preferred or os.getenv("OLLAMA_LLM_MODEL", "mistral:7b")).strip()
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            installed = [m.get("name", "") for m in data.get("models", [])]
            if target in installed:
                return target
            target_base = target.split(":")[0]
            for m in installed:
                if m.split(":")[0] == target_base:
                    return m
            priority = ["mistral:7b", "llama3:latest", "mistral", "llama3", "llava:7b"]
            for cand in priority:
                for m in installed:
                    if m == cand or m.startswith(cand.split(":")[0]):
                        print(f"[Topic Extraction] Notice: Configured model '{target}' not installed in Ollama. Falling back to '{m}'.")
                        return m
    except Exception as e:
        print(f"[Topic Extraction] Notice: Could not query Ollama tags: {e}")
    return target


JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "topics": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "topic_name": {"type": "string"},
                    "chunk_ids": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "subtopics": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "subtopic_name": {"type": "string"},
                                "chunk_ids": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                }
                            },
                            "required": ["subtopic_name", "chunk_ids"]
                        }
                    }
                },
                "required": ["topic_name", "chunk_ids", "subtopics"]
            }
        }
    },
    "required": ["topics"]
}

PROMPT_TEMPLATE = """You are an AI tasked with extracting the topic and subtopic structure of an academic syllabus.

Read the following chunks of text extracted from a syllabus PDF. Each chunk has an associated ID.
Extract a hierarchical structure of Topics and Subtopics.

CRITICAL RULES:
1. Identify meaningful academic topics.
2. Identify subtopics within those topics.
3. Associate each topic and subtopic with the relevant chunk_ids where they are discussed.
4. DO NOT include any Unit level hierarchy (e.g. Unit 1, Unit 2). If the text mentions units, ignore the word "Unit" and just use the actual topic name. The top level must be Topic.
5. Ignore page numbers, headers, and footers.
6. Ignore administrative information.
7. Avoid duplicate topics or subtopics. Merge similar concepts into one.
8. NEVER invent topics that are not supported by the text.
9. ONLY reference valid chunk IDs provided below.

Here are the text chunks from the syllabus:
{chunks_text}

Extract the topics and subtopics into the exact requested JSON format:
{{"topics": [{{"topic_name": "...", "chunk_ids": ["..."], "subtopics": [{{"subtopic_name": "...", "chunk_ids": ["..."]}}]}}]}}
"""

# ─── Method A: Refined Rule-Based Extraction ──────────────────────────────────

UNIT_REGEX = re.compile(
    r"^\s*\b(?:Unit|Module|Chapter|Part)\b\s*[\-–—:.\s\ufffd]*([0-9IVXLCDM]+)\s*[\-–—:.\s\ufffd]*\s*([A-Za-z0-9\s\,\-\&\'\/]+)",
    re.IGNORECASE
)
SUB_HEADING_REGEX = re.compile(
    r"^\s*(\d+\.\d+(?:\.\d+)?)\s*[\-–—:.\s\ufffd]+\s*([A-Z][A-Za-z0-9\s\,\-\&\'\/]{3,80})$"
)
NUMBERED_SECTION_REGEX = re.compile(
    r"^\s*(\d{1,2})\.\s+([A-Z][A-Za-z0-9\s\,\-\&\'\/]{4,80})$"
)

NOISE_WORDS = {
    'price', 'sold', 'marks', 'exam', 'question', 'duration', 'page', 'semester',
    'credit', 'hours', 'author', 'publisher', 'reference', 'textbook', 'copyright',
    'assignment', 'prerequisite', 'syllabus'
}

def is_noise(text_line: str) -> bool:
    low = text_line.lower().strip()
    if any(w in low for w in NOISE_WORDS):
        return True
    if low.endswith("?") or "(a)" in low or "(b)" in low or "(c)" in low or "(d)" in low:
        return True
    return False

def detect_topics_rule_based(all_chunks):
    """
    Method A: Precision rule-based topic detection.
    1. Prioritizes Unit / Module / Chapter / Part structures.
    2. Accurately identifies subheadings (e.g. 1.1, 1.2) without false-positive numbered bullets.
    3. Falls back to clean numbered sections if no Unit keywords exist.
    """
    topics = []
    current_topic = None
    has_units = False

    # Check if document has explicit Unit/Module structure
    for cid, content in all_chunks:
        for line in content.split("\n"):
            line = line.strip()
            if 4 <= len(line) <= 120 and not is_noise(line):
                if UNIT_REGEX.match(line):
                    has_units = True
                    break
        if has_units:
            break

    for cid, content in all_chunks:
        lines = content.split("\n")
        for line in lines:
            line = line.strip()
            if not line or len(line) < 4 or len(line) > 120 or is_noise(line):
                continue

            # 1. Match Unit / Module Header
            m_unit = UNIT_REGEX.match(line)
            if m_unit:
                uname = m_unit.group(2).strip()
                if len(uname) >= 3 and not is_noise(uname):
                    existing = next((t for t in topics if t["topic_name"].lower() == uname.lower()), None)
                    if existing:
                        current_topic = existing
                        if cid not in current_topic["chunk_ids"]:
                            current_topic["chunk_ids"].append(cid)
                    else:
                        current_topic = {
                            "topic_name": uname,
                            "chunk_ids": [cid],
                            "subtopics": []
                        }
                        topics.append(current_topic)
                    continue

            # 2. If inside a Unit, capture subtopics (e.g. 1.1 Definition)
            if has_units and current_topic:
                m_sub = SUB_HEADING_REGEX.match(line)
                if not m_sub and len(current_topic["subtopics"]) < 15:
                    m_sub = NUMBERED_SECTION_REGEX.match(line)

                if m_sub:
                    sname = m_sub.group(2).strip()
                    if len(sname) >= 3 and not is_noise(sname):
                        if not any(s["subtopic_name"].lower() == sname.lower() for s in current_topic["subtopics"]):
                            current_topic["subtopics"].append({
                                "subtopic_name": sname,
                                "chunk_ids": [cid]
                            })
                            continue

            # 3. If no Unit headers in document, check clean numbered sections (1. Topic)
            elif not has_units:
                m_sec = NUMBERED_SECTION_REGEX.match(line)
                if m_sec:
                    tname = m_sec.group(2).strip()
                    if len(tname) >= 4 and not is_noise(tname):
                        existing = next((t for t in topics if t["topic_name"].lower() == tname.lower()), None)
                        if not existing:
                            current_topic = {
                                "topic_name": tname,
                                "chunk_ids": [cid],
                                "subtopics": []
                            }
                            topics.append(current_topic)
                        continue

            # Associate chunk with current topic if under it
            if current_topic and cid not in current_topic["chunk_ids"]:
                current_topic["chunk_ids"].append(cid)

    return topics

def calculate_extraction_confidence(topics):
    if not topics:
        return 0.0

    score = 0.0

    # 1. Number of topics: 1 to 15 is standard for a syllabus or unit
    if 1 <= len(topics) <= 15:
        score += 0.35
    elif len(topics) <= 25:
        score += 0.20
    else:
        # > 25 indicates false-positive matching of body text
        return 0.20

    # 2. Subtopics existence & quality
    topics_with_subs = sum(1 for t in topics if len(t["subtopics"]) > 0)
    if topics_with_subs > 0:
        ratio = topics_with_subs / len(topics)
        score += 0.35 * ratio

    # 3. Valid names (between 3 and 80 chars)
    valid_names = sum(1 for t in topics if 3 <= len(t["topic_name"]) <= 80)
    score += 0.30 * (valid_names / len(topics))

    return min(score, 1.0)

# ─── AI Topic Extraction (Gemini + Local Ollama Fallback) ──────────────────────

def process_raw_topics(raw_topics, valid_chunk_ids):
    """Clean, merge duplicates, and validate chunk IDs against the database."""
    merged_topics_dict = {}

    for t in raw_topics:
        topic_name = t.get("topic_name", "Unnamed Topic")
        topic_name_lower = topic_name.lower().strip()
        topic_chunk_ids = [cid for cid in t.get("chunk_ids", []) if cid in valid_chunk_ids]

        if topic_name_lower not in merged_topics_dict:
            merged_topics_dict[topic_name_lower] = {
                "topic_name": topic_name,
                "chunk_ids": set(topic_chunk_ids),
                "subtopics": {}
            }
        else:
            merged_topics_dict[topic_name_lower]["chunk_ids"].update(topic_chunk_ids)

        for st in t.get("subtopics", []):
            st_name = st.get("subtopic_name", "Unnamed Subtopic")
            st_name_lower = st_name.lower().strip()
            st_chunk_ids = [cid for cid in st.get("chunk_ids", []) if cid in valid_chunk_ids]

            if st_name_lower not in merged_topics_dict[topic_name_lower]["subtopics"]:
                merged_topics_dict[topic_name_lower]["subtopics"][st_name_lower] = {
                    "subtopic_name": st_name,
                    "chunk_ids": set(st_chunk_ids)
                }
            else:
                merged_topics_dict[topic_name_lower]["subtopics"][st_name_lower]["chunk_ids"].update(st_chunk_ids)

    validated_topics = []
    for topic_lower, topic_data in merged_topics_dict.items():
        validated_subtopics = []
        for st_lower, st_data in topic_data["subtopics"].items():
            if st_data["chunk_ids"] or topic_data["chunk_ids"]:
                validated_subtopics.append({
                    "subtopic_name": st_data["subtopic_name"],
                    "chunk_ids": list(st_data["chunk_ids"])
                })

        if topic_data["chunk_ids"] or validated_subtopics:
            validated_topics.append({
                "topic_name": topic_data["topic_name"],
                "chunk_ids": list(topic_data["chunk_ids"]),
                "subtopics": validated_subtopics
            })

    return validated_topics

def extract_topics_with_gemini(all_chunks, valid_chunk_ids, syllabus_id, db):
    """Google AI Studio (Gemini) API: processes all chunks in a single high-speed cloud call."""
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is missing or empty")

    t_start = time.perf_counter()
    print(f"[TIMING] [Topic Extraction AI (Gemini)] Calling Google AI Studio ({gemini_model}) for {len(all_chunks)} chunks in a single pass...")

    chunks_text_list = [f"--- Chunk ID: {c[0]} ---\n{c[1]}\n" for c in all_chunks]
    chunks_text = "\n".join(chunks_text_list)
    prompt = PROMPT_TEMPLATE.format(chunks_text=chunks_text)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_api_key}"
    
    # Reasoning models (e.g. gemini-2.5-flash) spend minutes generating thinking tokens by default.
    # Disabling thinking budget ensures immediate responses in seconds.
    gen_config = {
        "response_mime_type": "application/json",
        "temperature": 0.2,
        "thinkingConfig": {
            "thinkingBudget": 0
        }
    }
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": gen_config
    }

    def _execute_gemini_request(p):
        req = urllib.request.Request(
            url,
            data=json.dumps(p).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            return json.loads(resp.read().decode("utf-8"))

    try:
        res_data = _execute_gemini_request(payload)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        if "thinkingConfig" in err_body:
            # If the model does not support thinkingConfig, retry without it
            del payload["generationConfig"]["thinkingConfig"]
            res_data = _execute_gemini_request(payload)
        else:
            raise RuntimeError(f"Gemini API HTTP {e.code} ({e.reason}): {err_body}")

    candidate = res_data["candidates"][0]
    text_content = candidate["content"]["parts"][0]["text"]
    parsed = json.loads(text_content)
    raw_topics = parsed.get("topics", [])
    if not raw_topics and isinstance(parsed, list):
        raw_topics = parsed

    duration = time.perf_counter() - t_start
    print(f"[TIMING] [Topic Extraction AI (Gemini)] Gemini completed in {duration:.2f}s ({len(raw_topics)} raw topics found)")
    return process_raw_topics(raw_topics, valid_chunk_ids)

def extract_topics_with_ollama(all_chunks, valid_chunk_ids, syllabus_id, db):
    """Local Ollama extraction with num_ctx=4096 to prevent memory overflow."""
    t_ai_start = time.perf_counter()
    active_model = resolve_ollama_model()
    BATCH_SIZE = 10
    total_batches = (len(all_chunks) + BATCH_SIZE - 1) // BATCH_SIZE
    all_extracted_topics = []

    print(f"[TIMING] [Topic Extraction AI (Local Ollama)] Starting AI extraction with '{active_model}' across {total_batches} batch(es)...")

    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch_idx = i // BATCH_SIZE + 1
        batch_t0 = time.perf_counter()
        batch = all_chunks[i:i+BATCH_SIZE]
        chunks_text_list = [f"--- Chunk ID: {c[0]} ---\n{c[1]}\n" for c in batch]
        chunks_text = "\n".join(chunks_text_list)
        prompt = PROMPT_TEMPLATE.format(chunks_text=chunks_text)

        payload = {
            "model": active_model,
            "prompt": prompt,
            "format": JSON_SCHEMA,
            "stream": False,
            "options": {
                "num_ctx": 4096
            }
        }

        try:
            req = urllib.request.Request(
                OLLAMA_API_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=120) as response:
                result_json = json.loads(response.read().decode("utf-8"))
                llm_response_text = result_json.get("response", "{}")

                parsed_data = json.loads(llm_response_text)
                batch_topics = parsed_data.get("topics", [])
                all_extracted_topics.extend(batch_topics)
                batch_duration = time.perf_counter() - batch_t0
                print(f"[TIMING] [Topic Extraction AI (Ollama)] Batch {batch_idx}/{total_batches} completed in {batch_duration:.2f}s ({len(batch_topics)} raw topics found)")
        except urllib.error.HTTPError as e:
            batch_duration = time.perf_counter() - batch_t0
            err_body = e.read().decode("utf-8", errors="replace")
            print(f"Warning: Failed to process batch {batch_idx - 1} after {batch_duration:.2f}s: HTTP Error {e.code} ({e.reason}) - {err_body}")
            continue
        except Exception as e:
            batch_duration = time.perf_counter() - batch_t0
            print(f"Warning: Failed to process batch {batch_idx - 1} after {batch_duration:.2f}s: {e}")
            continue

    ai_duration = time.perf_counter() - t_ai_start
    print(f"[TIMING] [Topic Extraction AI (Local Ollama)] Total local AI extraction completed in {ai_duration:.2f}s")
    return process_raw_topics(all_extracted_topics, valid_chunk_ids)

def extract_topics_with_ai(all_chunks, valid_chunk_ids, syllabus_id, db):
    """
    Dispatches topic extraction to Gemini API or local Ollama based on LLM_PROVIDER in .env.
    Automatically falls back to local Ollama if Gemini API fails or if no API key is provided.
    """
    provider = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    if provider == "gemini":
        if api_key:
            try:
                return extract_topics_with_gemini(all_chunks, valid_chunk_ids, syllabus_id, db)
            except Exception as e:
                active_local = resolve_ollama_model()
                print(f"Warning: Gemini API topic extraction failed ({e}). Falling back to local Ollama ({active_local})...")
        else:
            active_local = resolve_ollama_model()
            print(f"[Topic Extraction AI] LLM_PROVIDER='gemini' but GEMINI_API_KEY is not set in .env. Falling back to local Ollama ({active_local})...")

    # Local Ollama (either explicitly chosen or as automatic fallback)
    return extract_topics_with_ollama(all_chunks, valid_chunk_ids, syllabus_id, db)

# ─── Orchestrator ─────────────────────────────────────────────────────────────

def extract_topics_for_syllabus(syllabus_id: UUID, db: Session):
    stage_t0 = time.perf_counter()
    print(f"[TIMING] [Topic Extraction] Starting topic extraction for syllabus: {syllabus_id}")

    # 1. Fetch chunks from PostgreSQL
    result = db.execute(
        text("SELECT id, chunk_index, content, metadata FROM document_chunks WHERE syllabus_id = :sid ORDER BY chunk_index"),
        {"sid": syllabus_id}
    ).fetchall()

    if not result:
        raise ValueError("No document chunks found for this syllabus.")

    valid_chunk_ids = set()
    all_chunks = []

    for row in result:
        chunk_id = str(row.id)
        valid_chunk_ids.add(chunk_id)
        all_chunks.append((chunk_id, row.content))

    # 2. Try Rule-based Extraction (Method A)
    rb_t0 = time.perf_counter()
    rule_based_topics = detect_topics_rule_based(all_chunks)
    confidence = calculate_extraction_confidence(rule_based_topics)
    rb_duration = time.perf_counter() - rb_t0
    print(f"[TIMING] [Topic Extraction] Rule-based detection took {rb_duration:.3f}s (confidence: {confidence:.2f}, topics found: {len(rule_based_topics)})")

    # 3. Check Confidence and Fallback to AI if needed
    if confidence >= 0.80:
        print("[TIMING] [Topic Extraction] Confidence >= 0.80. Using rule-based topics (0 LLM overhead).")
        validated_topics = rule_based_topics
    else:
        print(f"[TIMING] [Topic Extraction] Confidence {confidence:.2f} < 0.80 -> Triggering AI fallback extraction...")
        db.execute(
            text("UPDATE syllabus SET stage = 'AI_TOPIC_FALLBACK' WHERE id = :sid"),
            {"sid": syllabus_id}
        )
        db.commit()
        validated_topics = extract_topics_with_ai(all_chunks, valid_chunk_ids, syllabus_id, db)

    # 4. Save to MongoDB
    mongo_t0 = time.perf_counter()
    now = datetime.now(timezone.utc)
    mongo_doc = {
        "uploaded_syllabus_id": str(syllabus_id),
        "topics": validated_topics,
        "updated_at": now
    }

    try:
        existing = syllabus_topic_mapping_collection.find_one({"uploaded_syllabus_id": str(syllabus_id)})
        if existing:
            syllabus_topic_mapping_collection.update_one(
                {"_id": existing["_id"]},
                {"$set": mongo_doc}
            )
        else:
            mongo_doc["created_at"] = now
            syllabus_topic_mapping_collection.insert_one(mongo_doc)
        mongo_duration = time.perf_counter() - mongo_t0
    except Exception as e:
        raise RuntimeError(f"Failed to save topic mapping to MongoDB: {e}")

    stage_total = time.perf_counter() - stage_t0
    print(
        f"[TIMING] [Topic Extraction] Stage complete in {stage_total:.2f}s "
        f"(Extracted {len(validated_topics)} topics, MongoDB save: {mongo_duration:.3f}s)"
    )
    return mongo_doc

def get_topics_for_syllabus(syllabus_id: UUID):
    doc = syllabus_topic_mapping_collection.find_one({"uploaded_syllabus_id": str(syllabus_id)})
    if not doc:
        return None
    doc.pop("_id", None)
    return doc
