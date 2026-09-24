import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Any
from sqlalchemy import text
from sqlalchemy.orm import Session

from databases.mongo import get_mongo_db
from services.exam_service import get_exam_by_id
from services.exam_blueprint_service import get_blueprint
from services.question_bank_service import save_question_bank, get_active_question_bank, set_generation_status, update_question_bank
from services.question_validation_service import validate_generated_questions

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_API_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_GENERATION_MODEL = os.getenv("OLLAMA_GENERATION_MODEL", "mistral:7b").strip()

def get_context_for_exam(exam: dict, db: Session) -> str:
    """
    Retrieves syllabus chunks for the selected PDFs and builds a text context.
    For Phase 2, we just load all chunks from the selected PDFs using the topic mapping.
    """
    selected_pdfs = exam.get("selected_pdf_ids", [])
    if not selected_pdfs:
        return ""
        
    mongo_db = get_mongo_db()
    
    # 1. Get chunk_ids from topic mapping
    chunk_ids = set()
    mappings = mongo_db.syllabus_topic_mapping.find(
        {"uploaded_syllabus_id": {"$in": [str(pid) for pid in selected_pdfs]}}
    )
    
    for mapping in mappings:
        for topic in mapping.get("topics", []):
            chunk_ids.update(topic.get("chunk_ids", []))
            for subtopic in topic.get("subtopics", []):
                chunk_ids.update(subtopic.get("chunk_ids", []))
                
    if not chunk_ids:
        return ""
        
    # 2. Get chunks from PostgreSQL
    query = text("""
        SELECT content FROM document_chunks 
        WHERE id = ANY(CAST(:chunk_ids AS uuid[]))
    """)
    result = db.execute(query, {"chunk_ids": list(chunk_ids)})
    
    # Limit context size to prevent overwhelming local LLMs
    # Taking approx top 15 chunks (or whatever is reasonable for small context windows)
    chunks_text = [row.content for row in result.fetchmany(15)]
    return "\n\n---\n\n".join(chunks_text)

def generate_section_questions(section: dict, context: str, existing_questions: str = "") -> List[Dict[str, Any]]:
    """
    Calls Ollama to generate questions for a specific section based on context.
    """
    q_type = section.get("type", "mcq")
    count = section.get("count", 1)
    marks = section.get("marks_each", 1)
    
    json_schema = {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question_text": {"type": "string"},
                        "type": {"type": "string"},
                        "bloom_level": {"type": "string", "enum": ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]},
                        "mark": {"type": "integer"},
                        "options": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {"type": "string"},
                                    "text": {"type": "string"}
                                }
                            }
                        }
                    },
                    "required": ["question_text", "type", "bloom_level", "mark"]
                }
            }
        },
        "required": ["questions"]
    }

    type_instructions = ""
    if q_type == "mcq":
        type_instructions = f"Generate {count} Multiple Choice Questions (MCQ). Each must have exactly 4 options."
    elif q_type == "short":
        type_instructions = f"Generate {count} Short Answer questions."
    elif q_type == "long":
        type_instructions = f"Generate {count} Long Answer questions."
    elif q_type == "case_study":
        type_instructions = f"Generate {count} Case Study questions."

    avoid_prompt = f"\nDo NOT generate any of the following questions again:\n{existing_questions}\n" if existing_questions else ""

    prompt = f"""You are an expert academic question generator.
Use the provided Syllabus Context to generate exam questions.

{type_instructions}
Each question must be worth {marks} marks.
Assign an appropriate Bloom's Taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, Create).
{avoid_prompt}

Syllabus Context:
{context}

Respond STRICTLY with JSON matching the required schema.
"""

    payload = {
        "model": OLLAMA_GENERATION_MODEL,
        "prompt": prompt,
        "format": json_schema,
        "stream": False,
        "options": {
            "temperature": 0.3
        }
    }
    
    try:
        req = urllib.request.Request(
            OLLAMA_API_URL, 
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode('utf-8'))
            return json.loads(result.get("response", "{}"))
    except Exception as e:
        print(f"Error calling Ollama: {e}")
        return {"questions": []}

def generate_exam_paper_job(exam_id: str, db: Session):
    """
    Background job to generate the entire exam paper.
    """
    try:
        set_generation_status(exam_id, "generating", progress=0, current_section="Initializing")
        
        exam = get_exam_by_id(exam_id, db)
        if not exam:
            set_generation_status(exam_id, "generation_failed")
            return
            
        blueprint = get_blueprint(exam_id)
        if not blueprint:
            set_generation_status(exam_id, "generation_failed")
            return
            
        set_generation_status(exam_id, "generating", progress=10, current_section="Building Context")
        context = get_context_for_exam(exam, db)
        
        if not context:
            set_generation_status(exam_id, "generation_failed")
            return

        sections_count = len(blueprint.sections)
        generated_sections = []
        all_existing_text = []

        for idx, bp_section in enumerate(blueprint.sections):
            section_dict = bp_section.dict()
            progress = 10 + int(80 * (idx / max(sections_count, 1)))
            set_generation_status(exam_id, "generating", progress=progress, current_section=f"Generating {section_dict.get('section')}")
            
            # Retry loop for generation
            valid_questions = []
            retries = 0
            while len(valid_questions) < section_dict.get("count", 1) and retries < 3:
                llm_output = generate_section_questions(section_dict, context, existing_questions="\n".join(all_existing_text))
                new_valid = validate_generated_questions(llm_output, section_dict)
                valid_questions.extend(new_valid)
                retries += 1
                
            # If we generated too many, slice it
            valid_questions = valid_questions[:section_dict.get("count", 1)]
            
            # Add to text tracker for avoiding duplicates and assign order
            for idx_q, q in enumerate(valid_questions):
                q["order"] = idx_q
                all_existing_text.append(q["question_text"])
                
            generated_sections.append({
                "sectionNo": chr(65 + idx),
                "sectionName": section_dict.get("section"),
                "questions": valid_questions
            })
            
        # Archive previous active bank if exists
        mongo_db = get_mongo_db()
        active_bank = get_active_question_bank(exam_id)
        new_version = 1
        if active_bank:
            new_version = active_bank.get("version", 0) + 1
            mongo_db.question_bank.update_one(
                {"_id": active_bank["_id"]},
                {"$set": {"is_active": False}}
            )

        new_paper = {
            "exam_id": exam_id,
            "version": new_version,
            "status": "reviewing",
            "is_active": True,
            "question_body": {
                "sections": generated_sections
            },
            "generation": {
                "method": "local_llm",
                "model": OLLAMA_GENERATION_MODEL,
                "generated_at": datetime.now(timezone.utc),
                "blueprint_version": blueprint.version,
                "syllabus_ids": [str(pid) for pid in exam.get("selected_pdf_ids", [])] if isinstance(exam, dict) else [str(pid) for pid in exam.selected_pdf_ids]
            }
        }
        
        save_question_bank(new_paper)
        set_generation_status(exam_id, "generated", progress=100)
        
    except Exception as e:
        print(f"Paper generation failed: {e}")
        set_generation_status(exam_id, "generation_failed")

def regenerate_single_question(exam_id: str, question_id: str, db: Session) -> dict | None:
    """
    Regenerates a single question synchronously.
    """
    paper = get_active_question_bank(exam_id)
    if not paper:
        return None
        
    target_section = None
    target_question = None
    all_other_questions = []
    
    for sec in paper.get("question_body", {}).get("sections", []):
        for q in sec.get("questions", []):
            if q.get("question_id") == question_id:
                target_section = sec
                target_question = q
            else:
                all_other_questions.append(q.get("question_text", ""))
                
    if not target_question or not target_section:
        return None
        
    exam = get_exam_by_id(exam_id, db)
    context = get_context_for_exam(exam, db)
    
    # We only need 1 question of this type
    bp_section_mock = {
        "type": target_question.get("type", "mcq"),
        "count": 1,
        "marks_each": target_question.get("mark", 1)
    }
    
    avoid_text = "\n".join(all_other_questions)
    
    retries = 0
    valid_q = None
    while retries < 2 and not valid_q:
        llm_output = generate_section_questions(bp_section_mock, context, existing_questions=avoid_text)
        valid_qs = validate_generated_questions(llm_output, bp_section_mock)
        if valid_qs:
            valid_q = valid_qs[0]
        retries += 1
        
    if not valid_q:
        return None
        
    # Replace the old question, maintaining order and ID? No, requirement says "new question_id"
    # But wait, frontend needs to replace the UI block. We'll return the new question and swap it.
    valid_q["is_regenerated"] = True
    
    # Apply to DB
    for sec in paper.get("question_body", {}).get("sections", []):
        for idx, q in enumerate(sec.get("questions", [])):
            if q.get("question_id") == question_id:
                # Maintain order metadata
                valid_q["order"] = q.get("order", idx)
                sec["questions"][idx] = valid_q
                break
                
    update_question_bank(exam_id, paper["version"], {"question_body": paper["question_body"]})
    return valid_q
