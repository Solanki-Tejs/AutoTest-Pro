from typing import List, Dict, Any
import uuid

def validate_generated_questions(llm_output: Dict[str, Any], blueprint_section: dict) -> List[Dict[str, Any]]:
    """
    Validates and normalizes the JSON output from the LLM for a specific section.
    Filters out invalid questions and ensures required fields exist.
    """
    valid_questions = []
    
    questions = llm_output.get("questions", [])
    if not isinstance(questions, list):
        return []

    required_type = blueprint_section.get("type", "").lower()
    required_marks = blueprint_section.get("marks_each", 1)

    for q in questions:
        if not isinstance(q, dict):
            continue
            
        question_text = q.get("question_text", "").strip()
        if not question_text:
            continue
            
        bloom_level = q.get("bloom_level", "Understand")
        valid_bloom = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"]
        if bloom_level not in valid_bloom:
            bloom_level = "Understand"
            
        # Enforce type and marks
        q_type = q.get("type", required_type).lower()
        if q_type != required_type:
            q_type = required_type
            
        mark = q.get("mark", required_marks)
        if mark != required_marks:
            mark = required_marks

        validated_q = {
            "question_id": str(uuid.uuid4()),
            "question_text": question_text,
            "type": q_type,
            "bloom_level": bloom_level,
            "mark": mark,
            "is_edited": False,
            "is_regenerated": False,
            "options": [],
            "correct_answer": None
        }
        
        if required_type == "mcq":
            options = q.get("options", [])
            if isinstance(options, list) and len(options) >= 2:
                # Normalize options
                validated_options = []
                for idx, opt in enumerate(options[:4]): # Max 4 options
                    if isinstance(opt, dict) and "text" in opt:
                        opt_id = opt.get("id", chr(65 + idx))
                        validated_options.append({
                            "id": opt_id,
                            "text": str(opt["text"]).strip()
                        })
                    elif isinstance(opt, str):
                        validated_options.append({
                            "id": chr(65 + idx),
                            "text": opt.strip()
                        })
                
                # If we don't have at least 2 valid options, skip this MCQ
                if len(validated_options) < 2:
                    continue
                    
                validated_q["options"] = validated_options
                validated_q["correct_answer"] = q.get("correct_answer", validated_options[0]["id"])
            else:
                # Missing options for MCQ
                continue
                
        valid_questions.append(validated_q)
        
    return valid_questions
