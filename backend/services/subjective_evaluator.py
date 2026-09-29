import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
import os
from pydantic import BaseModel



OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_API_URL = f"{OLLAMA_BASE_URL}/api/generate"

def resolve_ollama_model(preferred: str = None) -> str:
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
                        print(f"[Subjective Evaluator] Notice: Configured model '{target}' not installed in Ollama. Falling back to '{m}'.")
                        return m
    except Exception as e:
        print(f"[Subjective Evaluator] Notice: Could not query Ollama tags: {e}")
    return target

class SubjectiveEvaluation(BaseModel):
    awarded_marks: float
    max_marks: float
    feedback: str
    justification: str
    confidence: float
    needs_review: bool

def evaluate_with_ollama(prompt: str, max_marks: float) -> dict:
    active_model = resolve_ollama_model()
    schema = SubjectiveEvaluation.model_json_schema()
    
    payload = {
        "model": active_model,
        "prompt": prompt,
        "format": schema,
        "stream": False,
        "options": {
            "temperature": 0.1
        }
    }
    
    try:
        req = urllib.request.Request(
            OLLAMA_API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as response:
            result_json = json.loads(response.read().decode("utf-8"))
            llm_response_text = result_json.get("response", "{}")
            result = json.loads(llm_response_text)
            
            awarded = float(result.get("awarded_marks", 0))
            if awarded > max_marks:
                awarded = max_marks
            if awarded < 0:
                awarded = 0
                
            return {
                "status": "completed" if not result.get("needs_review") else "needs_review",
                "evaluator_model": f"ollama-{active_model}",
                "ai_assigned_marks": awarded,
                "ai_feedback": result.get("feedback", ""),
                "ai_justification": result.get("justification", ""),
                "ai_confidence_level": float(result.get("confidence", 1.0)),
                "evaluated_at": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        return {
            "status": "failed",
            "error_code": f"Ollama Error: {str(e)}",
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }

def evaluate_subjective(student_answer: dict, official_answer: dict, question_metadata: dict) -> dict:
    max_marks = float(question_metadata.get("mark", 1))
    student_text = student_answer.get("answer_text") or student_answer.get("answer") or ""
    
    if not student_text or not str(student_text).strip():
        return {
            "status": "completed",
            "evaluator_model": "deterministic",
            "ai_assigned_marks": 0.0,
            "ai_feedback": "Unanswered",
            "ai_justification": "The student did not provide an answer.",
            "ai_confidence_level": 1.0,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }

    provider = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    prompt = f"""
    You are an expert examiner. Evaluate the student's answer against the official answer and rubric.
    Question: {question_metadata.get("question_text", "")}
    Maximum Marks: {max_marks}
    Official Answer/Rubric: {official_answer.get("answer_text", "")}
    Student Answer: {student_text}
    
    Evaluate strictly. Do not award more than maximum marks.
    Output JSON strictly matching the schema.
    """
    
    if provider == "gemini":
        if api_key:
            try:
                gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-pro").strip()
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
                
                schema = SubjectiveEvaluation.model_json_schema()
                schema.pop('title', None)
                for prop in schema.get('properties', {}).values():
                    prop.pop('title', None)
                
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "responseMimeType": "application/json",
                        "responseSchema": schema
                    }
                }
                
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                
                with urllib.request.urlopen(req, timeout=60) as response:
                    result_json = json.loads(response.read().decode('utf-8'))
                    content = result_json.get("candidates", [])[0].get("content", {}).get("parts", [])[0].get("text", "{}")
                    result = json.loads(content)
                
                # Validation
                awarded = float(result.get("awarded_marks", 0))
                if awarded > max_marks:
                    awarded = max_marks
                if awarded < 0:
                    awarded = 0
                    
                return {
                    "status": "completed" if not result.get("needs_review") else "needs_review",
                    "evaluator_model": "gemini-2.5-pro",
                    "ai_assigned_marks": awarded,
                    "ai_feedback": result.get("feedback", ""),
                    "ai_justification": result.get("justification", ""),
                    "ai_confidence_level": float(result.get("confidence", 1.0)),
                    "evaluated_at": datetime.now(timezone.utc).isoformat()
                }
            except Exception as e:
                print(f"Warning: Gemini API evaluation failed ({e}). Falling back to local Ollama...")
                return evaluate_with_ollama(prompt, max_marks)
        else:
            print("Warning: GEMINI_API_KEY is not set. Falling back to local Ollama...")
            return evaluate_with_ollama(prompt, max_marks)
            
    elif provider == "mock":
        # Mock evaluation for fallback
        return {
            "status": "completed",
            "evaluator_model": "mock",
            "ai_assigned_marks": max_marks / 2, # Just a mock score
            "ai_feedback": "Mock evaluated.",
            "ai_justification": "Mock justification.",
            "ai_confidence_level": 0.8,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }
    else:
        # If ollama or some other provider
        return evaluate_with_ollama(prompt, max_marks)
