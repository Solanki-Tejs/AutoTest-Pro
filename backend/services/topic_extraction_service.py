import json
import urllib.request
import re
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

from databases.mongo import syllabus_topic_mapping_collection
from schemas.topic_schema import SyllabusTopicMappingBase

OLLAMA_API_URL = "http://127.0.0.1:11434/api/generate"
# Assuming llama3 or mistral is available. We'll use llama3 as it's common for JSON tasks.
LLM_MODEL = "llama3:latest"

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

Extract the topics and subtopics into the exact requested JSON format.
"""

def detect_topics_rule_based(all_chunks):
    # Rule-based detection using regex
    # Looks for numbered lists: "1. Topic Name" or "Unit I\nTopic Name" or alphabetic "A. Topic Name"
    # Subtopics: "1.1 Subtopic Name"
    
    topics = []
    current_topic = None
    
    topic_patterns = [
        re.compile(r"^(?:Unit\s+[A-Za-z0-9]+|Module\s+\d+|[IVXLCDM]+)[\.\:\s\n]+([A-Z][A-Za-z0-9\s\,\-]+)", re.MULTILINE | re.IGNORECASE),
        re.compile(r"^\s*(\d+)\.\s+([A-Z][A-Za-z0-9\s\,\-]+)", re.MULTILINE),
        re.compile(r"^\s*[A-Z]\.\s+([A-Z][A-Za-z0-9\s\,\-]+)", re.MULTILINE)
    ]
    
    subtopic_patterns = [
        re.compile(r"^\s*(\d+\.\d+)\.?\s+([A-Za-z0-9\s\,\-]+)", re.MULTILINE),
        re.compile(r"^\s*[a-z]\.\s+([A-Z][A-Za-z0-9\s\,\-]+)", re.MULTILINE)
    ]
    
    for chunk_id, content in all_chunks:
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if not line: continue
            
            # Check for subtopic first (more specific)
            sub_match = None
            for p in subtopic_patterns:
                m = p.match(line)
                if m:
                    sub_match = m
                    break
                    
            if sub_match and current_topic:
                sub_name = sub_match.group(2) if len(sub_match.groups()) > 1 else sub_match.group(1)
                sub_name = sub_name.strip()
                if len(sub_name) > 3:
                    current_topic["subtopics"].append({
                        "subtopic_name": sub_name,
                        "chunk_ids": [chunk_id]
                    })
                    continue
            
            # Check for topic
            top_match = None
            for p in topic_patterns:
                m = p.match(line)
                if m:
                    top_match = m
                    break
                    
            if top_match:
                top_name = top_match.group(2) if len(top_match.groups()) > 1 else top_match.group(1)
                top_name = top_name.strip()
                # Ignore generic words
                if len(top_name) > 3 and not top_name.lower().startswith('unit'):
                    current_topic = {
                        "topic_name": top_name,
                        "chunk_ids": [chunk_id],
                        "subtopics": []
                    }
                    topics.append(current_topic)
                    continue
                    
            # If line has no pattern but we have a current topic, we can associate the chunk with it
            if current_topic:
                if chunk_id not in current_topic["chunk_ids"]:
                    current_topic["chunk_ids"].append(chunk_id)
                if current_topic["subtopics"]:
                    # Also associate with the last subtopic
                    last_sub = current_topic["subtopics"][-1]
                    if chunk_id not in last_sub["chunk_ids"]:
                        last_sub["chunk_ids"].append(chunk_id)
                        
    return topics

def calculate_extraction_confidence(topics):
    if not topics:
        return 0.0
        
    score = 0.0
    
    # 1. Number of topics (expecting between 2 and 20)
    if 2 <= len(topics) <= 20:
        score += 0.3
    elif len(topics) > 0:
        score += 0.1
        
    # 2. Subtopics existence
    topics_with_subs = sum(1 for t in topics if len(t["subtopics"]) > 0)
    if topics_with_subs > 0:
        score += 0.3 * (topics_with_subs / len(topics))
        
    # 3. Valid names (no extremely short or long names)
    valid_names = 0
    for t in topics:
        if 3 < len(t["topic_name"]) < 100:
            valid_names += 1
    score += 0.4 * (valid_names / len(topics))
    
    return score

def extract_topics_with_ai(all_chunks, valid_chunk_ids, syllabus_id, db):
        
    # Batch chunks (e.g., 10 chunks per batch to avoid LLM context overflow)
    BATCH_SIZE = 10
    all_extracted_topics = []
    
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i:i+BATCH_SIZE]
        chunks_text_list = [f"--- Chunk ID: {c[0]} ---\n{c[1]}\n" for c in batch]
        chunks_text = "\n".join(chunks_text_list)
        prompt = PROMPT_TEMPLATE.format(chunks_text=chunks_text)
        
        payload = {
            "model": LLM_MODEL,
            "prompt": prompt,
            "format": JSON_SCHEMA,
            "stream": False
        }
        
        try:
            req = urllib.request.Request(
                OLLAMA_API_URL,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as response:
                result_json = json.loads(response.read().decode("utf-8"))
                llm_response_text = result_json.get("response", "{}")
                
                parsed_data = json.loads(llm_response_text)
                batch_topics = parsed_data.get("topics", [])
                all_extracted_topics.extend(batch_topics)
        except Exception as e:
            print(f"Warning: Failed to process batch {i//BATCH_SIZE}: {e}")
            continue
            
    # Merge and Validate chunk IDs to prevent hallucinations
    merged_topics_dict = {}
    
    for t in all_extracted_topics:
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
            
        # Process subtopics
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

    # Reconstruct list from merged dict
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

def extract_topics_for_syllabus(syllabus_id: UUID, db: Session):
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
        
    # 2. Try Rule-based Extraction
    rule_based_topics = detect_topics_rule_based(all_chunks)
    confidence = calculate_extraction_confidence(rule_based_topics)
    
    # 3. Check Confidence and Fallback to AI if needed
    if confidence >= 0.80:
        validated_topics = rule_based_topics
    else:
        # Update stage to AI Fallback
        db.execute(
            text("UPDATE syllabus SET stage = 'AI_TOPIC_FALLBACK' WHERE id = :sid"),
            {"sid": syllabus_id}
        )
        db.commit()
        validated_topics = extract_topics_with_ai(all_chunks, valid_chunk_ids, syllabus_id, db)

    # 4. Save to MongoDB
    now = datetime.now(timezone.utc)
    mongo_doc = {
        "uploaded_syllabus_id": str(syllabus_id),
        "topics": validated_topics,
        "updated_at": now
    }
    
    # Upsert the topic mapping
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
    except Exception as e:
        raise RuntimeError(f"Failed to save topic mapping to MongoDB: {e}")
        
    return mongo_doc

def get_topics_for_syllabus(syllabus_id: UUID):
    doc = syllabus_topic_mapping_collection.find_one({"uploaded_syllabus_id": str(syllabus_id)})
    if not doc:
        return None
        
    # MongoDB returns _id which isn't serializable by default Pydantic if not handled
    # Remove _id or convert it
    doc.pop("_id", None)
    return doc
