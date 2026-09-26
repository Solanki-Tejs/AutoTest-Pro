import json
import os
import urllib.request
import urllib.error
from datetime import datetime, timezone
import uuid
from sqlalchemy.orm import Session

from databases.mongo import get_mongo_db
from services.exam_service import get_exam_by_id
from services.question_bank_service import get_active_question_bank
from services.question_generation_service import get_context_for_exam
from services.answer_bank_service import save_answer_bank, set_answer_generation_status, get_active_answer_bank, update_answer_bank

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_API_URL = f"{OLLAMA_BASE_URL}/api/generate"
OLLAMA_GENERATION_MODEL = os.getenv("OLLAMA_GENERATION_MODEL", "mistral:7b").strip()

def _build_prompt_and_schema_for_answer(question: dict, context: str) -> tuple[str, dict]:
    q_type = question.get("type", "mcq")
    
    json_schema = {
        "type": "object",
        "properties": {
            "answer_text": {"type": "string"}
        },
        "required": ["answer_text"]
    }
    
    if q_type == "mcq":
        json_schema["properties"]["answer_key"] = {"type": "string"}
        json_schema["required"].append("answer_key")
        
    prompt = f"""You are an expert academic answer generator.
Use the provided Syllabus Context to generate the correct official answer for the following question.

Question: {question.get("question_text", "")}
Question Type: {q_type}
Marks: {question.get("mark", 1)}
Bloom Level: {question.get("bloom_level", "Understand")}

Syllabus Context:
{context}

Respond STRICTLY with JSON matching the required schema.
"""
    if q_type == "mcq":
        prompt += f"\nThe answer_key must be exactly one of the option IDs."
        options_text = "\n".join([f"{opt.get('id', '')}: {opt.get('text', '')}" for opt in question.get("options", [])])
        prompt += f"\nOptions:\n{options_text}\n"

    return prompt, json_schema

def generate_single_answer_with_gemini(question: dict, context: str) -> dict | None:
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is missing or empty")

    prompt, json_schema = _build_prompt_and_schema_for_answer(question, context)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": json_schema
        }
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.loads(response.read().decode('utf-8'))
        content = result.get("candidates", [])[0].get("content", {}).get("parts", [])[0].get("text", "{}")
        return json.loads(content)

def generate_single_answer_with_ollama(question: dict, context: str) -> dict | None:
    prompt, json_schema = _build_prompt_and_schema_for_answer(question, context)

    payload = {
        "model": OLLAMA_GENERATION_MODEL,
        "prompt": prompt,
        "format": json_schema,
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }
    
    req = urllib.request.Request(
        OLLAMA_API_URL, 
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        result = json.loads(response.read().decode('utf-8'))
        return json.loads(result.get("response", "{}"))

def generate_single_answer(question: dict, context: str) -> dict | None:
    try:
        print("[TIMING] Attempting to generate answer with Google AI Studio (Gemini)...")
        return generate_single_answer_with_gemini(question, context)
    except Exception as e:
        print(f"[TIMING] Gemini generation failed ({e}). Falling back to local Ollama model...")
        try:
            return generate_single_answer_with_ollama(question, context)
        except Exception as e2:
            print(f"Error calling Ollama for answer: {e2}")
            return None

def generate_answers_job(exam_id: str, db: Session, mode: str = "all"):
    try:
        set_answer_generation_status(exam_id, "generating", progress=0)
        
        exam = get_exam_by_id(exam_id, db)
        if not exam:
            set_answer_generation_status(exam_id, "failed")
            return
            
        qb = get_active_question_bank(exam_id)
        if not qb:
            set_answer_generation_status(exam_id, "failed")
            return
            
        context = get_context_for_exam(exam, db)
        
        all_questions = []
        for sec in qb.get("question_body", {}).get("sections", []):
            all_questions.extend(sec.get("questions", []))
            
        total_q = len(all_questions)
        set_answer_generation_status(exam_id, "generating", total_questions=total_q, generated_questions=0, failed_questions=0, progress=10)
        
        existing_ab = get_active_answer_bank(exam_id) if mode == "unedited" else None
        existing_answers = {ans.get("question_id"): ans for ans in existing_ab.get("answer_body", [])} if existing_ab else {}
        
        answers = []
        generated = 0
        failed = 0
        
        for idx, q in enumerate(all_questions):
            q_id = q.get("question_id")
            
            if mode == "unedited" and q_id in existing_answers:
                old_ans = existing_answers[q_id]
                if old_ans.get("is_edited") or not old_ans.get("is_stale", False):
                    answers.append(old_ans)
                    generated += 1
                    
                    progress = 10 + int(80 * ((idx + 1) / max(total_q, 1)))
                    set_answer_generation_status(exam_id, "generating", generated_questions=generated, failed_questions=failed, progress=progress)
                    continue
                    
            retries = 0
            valid_ans = None
            
            while not valid_ans and retries < 3:
                llm_output = generate_single_answer(q, context)
                if llm_output and llm_output.get("answer_text"):
                    if q.get("type") == "mcq" and not llm_output.get("answer_key"):
                        retries += 1
                        continue
                    
                    valid_ans = {
                        "answer_id": str(uuid.uuid4()),
                        "question_id": q.get("question_id"),
                        "answer_key": llm_output.get("answer_key"),
                        "answer_text": llm_output.get("answer_text"),
                        "answer_type": q.get("type"),
                        "is_edited": False,
                        "is_approved": False,
                        "is_stale": False,
                        "created_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc)
                    }
                retries += 1
                
            if valid_ans:
                answers.append(valid_ans)
                generated += 1
            else:
                failed += 1
                
            progress = 10 + int(80 * ((idx + 1) / max(total_q, 1)))
            set_answer_generation_status(exam_id, "generating", generated_questions=generated, failed_questions=failed, progress=progress)
            
        mongo_db = get_mongo_db()
        mongo_db.answer_bank.update_many(
            {"exam_id": exam_id},
            {"$set": {"is_active": False}}
        )
        
        new_ab = {
            "exam_id": exam_id,
            "question_bank_id": str(qb["_id"]),
            "question_bank_version": qb["version"],
            "answer_body": answers,
            "status": "reviewing",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        save_answer_bank(new_ab)
        set_answer_generation_status(exam_id, "generated", progress=100)
        
    except Exception as e:
        print(f"Answer generation failed: {e}")
        set_answer_generation_status(exam_id, "failed")

def regenerate_single_answer(exam_id: str, answer_id: str, db: Session) -> dict | None:
    ab = get_active_answer_bank(exam_id)
    if not ab:
        return None
        
    target_ans = None
    ans_idx = -1
    for i, a in enumerate(ab.get("answer_body", [])):
        if a.get("answer_id") == answer_id:
            target_ans = a
            ans_idx = i
            break
            
    if not target_ans:
        return None
        
    qb = get_active_question_bank(exam_id)
    if not qb:
        return None
        
    target_q = None
    for sec in qb.get("question_body", {}).get("sections", []):
        for q in sec.get("questions", []):
            if q.get("question_id") == target_ans.get("question_id"):
                target_q = q
                break
        if target_q:
            break
            
    if not target_q:
        return None
        
    exam = get_exam_by_id(exam_id, db)
    context = get_context_for_exam(exam, db)
    
    retries = 0
    valid_ans = None
    while not valid_ans and retries < 3:
        llm_output = generate_single_answer(target_q, context)
        if llm_output and llm_output.get("answer_text"):
            if target_q.get("type") == "mcq" and not llm_output.get("answer_key"):
                retries += 1
                continue
            
            valid_ans = target_ans.copy()
            valid_ans["answer_key"] = llm_output.get("answer_key")
            valid_ans["answer_text"] = llm_output.get("answer_text")
            valid_ans["is_edited"] = False
            valid_ans["is_stale"] = False
            valid_ans["updated_at"] = datetime.now(timezone.utc)
        retries += 1
        
    if valid_ans:
        ab["answer_body"][ans_idx] = valid_ans
        update_answer_bank(exam_id, {"answer_body": ab["answer_body"]})
        return valid_ans
        
    return None
