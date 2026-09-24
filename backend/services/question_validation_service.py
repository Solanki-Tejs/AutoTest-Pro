from typing import List, Dict, Any
import uuid

from schemas.question_bank_schema import QuestionSpecification
import re

def normalize_text(text: str) -> str:
    """
    Normalizes text for duplicate comparison.
    Converts to lowercase, removes all punctuation, and collapses whitespace.
    """
    if not text:
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def is_exact_duplicate(candidate: dict, accepted_questions: List[Dict[str, Any]]) -> bool:
    """
    Checks if the candidate question text is exactly the same as any accepted question,
    after normalization.
    """
    candidate_text = normalize_text(candidate.get("question_text", ""))
    if not candidate_text:
        return True # Reject empty questions as duplicates
        
    for q in accepted_questions:
        if normalize_text(q.get("question_text", "")) == candidate_text:
            return True
    return False

def validate_single_question(llm_output: Dict[str, Any], spec: QuestionSpecification) -> Dict[str, Any] | None:
    """
    Validates and normalizes the JSON output from the LLM for a single question.
    Enforces strict rules based on the specification.
    """
    if not isinstance(llm_output, dict):
        return None
        
    question_text = llm_output.get("question_text", "").strip()
    if not question_text:
        return None
        
    bloom_level = llm_output.get("bloom_level", spec.bloom_level)
    valid_bloom = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
    if bloom_level not in valid_bloom:
        bloom_level = spec.bloom_level
        
    q_type = llm_output.get("type", spec.type).lower()
    if q_type != spec.type:
        q_type = spec.type
        
    mark = llm_output.get("mark", spec.marks)
    if mark != spec.marks:
        mark = spec.marks

    validated_q = {
        "question_id": str(uuid.uuid4()),
        "question_text": question_text,
        "type": q_type,
        "bloom_level": bloom_level,
        "mark": mark,
        "is_edited": False,
        "is_regenerated": False,
        "options": []
    }
    
    if spec.type == "mcq":
        options = llm_output.get("options", [])
        if isinstance(options, list) and len(options) >= 2: # strict validation asks for 4, but we salvage if at least 2
            validated_options = []
            seen_texts = set()
            
            for idx, opt in enumerate(options[:4]):
                if isinstance(opt, dict) and "text" in opt:
                    opt_text = str(opt["text"]).strip()
                    opt_id = opt.get("id", chr(65 + idx))
                elif isinstance(opt, str):
                    opt_text = opt.strip()
                    opt_id = chr(65 + idx)
                else:
                    continue
                    
                # Reject duplicate options within the same MCQ
                norm_opt = normalize_text(opt_text)
                if not opt_text or norm_opt in seen_texts:
                    continue
                    
                seen_texts.add(norm_opt)
                validated_options.append({
                    "id": opt_id,
                    "text": opt_text
                })
            
            # Strict rule: we must have exactly 4 valid, unique options if the spec asked for it. 
            # If the LLM failed to provide 4, reject the question to force regeneration.
            if len(validated_options) != 4:
                return None
                
            validated_q["options"] = validated_options
        else:
            return None # Missing options
            
    return validated_q

def validate_generated_questions(llm_output: Dict[str, Any], section_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Validates a list of generated questions from the LLM based on the section dictionary.
    """
    if not isinstance(llm_output, dict):
        return []
        
    questions = llm_output.get("questions", [])
    if not isinstance(questions, list):
        return []
        
    valid_list = []
    expected_type = section_dict.get("type", "mcq").lower()
    expected_marks = section_dict.get("marks_each", 1)
    
    for q_data in questions:
        if not isinstance(q_data, dict):
            continue
            
        question_text = q_data.get("question_text", "").strip()
        if not question_text:
            continue
            
        bloom_level = q_data.get("bloom_level", "Understand")
        valid_bloom = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
        if bloom_level not in valid_bloom:
            bloom_level = "Understand"
            
        q_type = q_data.get("type", expected_type).lower()
        if q_type != expected_type:
            q_type = expected_type
            
        mark = q_data.get("mark", expected_marks)
        if mark != expected_marks:
            mark = expected_marks

        validated_q = {
            "question_id": str(uuid.uuid4()),
            "question_text": question_text,
            "type": q_type,
            "bloom_level": bloom_level,
            "mark": mark,
            "is_edited": False,
            "is_regenerated": False,
            "options": []
        }
        
        if expected_type == "mcq":
            options = q_data.get("options", [])
            if isinstance(options, list) and len(options) >= 2:
                validated_options = []
                seen_texts = set()
                
                for idx, opt in enumerate(options[:4]):
                    if isinstance(opt, dict) and "text" in opt:
                        opt_text = str(opt["text"]).strip()
                        opt_id = opt.get("id", chr(65 + idx))
                    elif isinstance(opt, str):
                        opt_text = opt.strip()
                        opt_id = chr(65 + idx)
                    else:
                        continue
                        
                    norm_opt = normalize_text(opt_text)
                    if not opt_text or norm_opt in seen_texts:
                        continue
                        
                    seen_texts.add(norm_opt)
                    validated_options.append({
                        "id": opt_id,
                        "text": opt_text
                    })
                
                if len(validated_options) != 4:
                    continue # Skip this question
                    
                validated_q["options"] = validated_options
            else:
                continue # Skip this question
                
        valid_list.append(validated_q)
        
    return valid_list
