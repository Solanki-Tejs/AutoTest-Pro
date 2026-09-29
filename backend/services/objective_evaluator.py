from datetime import datetime, timezone

def evaluate_objective(student_answer: dict, official_answer: dict, question_metadata: dict) -> dict:
    max_marks = float(question_metadata.get("mark", 1))
    
    student_resp = student_answer.get("answer_text") or student_answer.get("options") or student_answer.get("answer")
    if student_resp is None:
        student_resp = []
    elif isinstance(student_resp, str):
        student_resp = [student_resp]
        
    official_key = official_answer.get("answer_key", [])
    if official_key is None:
        official_key = []
    elif isinstance(official_key, str):
        official_key = [official_key]

    student_resp_set = {str(x).strip().lower() for x in student_resp if str(x).strip()}
    official_key_set = {str(x).strip().lower() for x in official_key if str(x).strip()}

    if not student_resp_set:
        return {
            "status": "completed",
            "evaluator_model": "deterministic",
            "ai_assigned_marks": 0.0,
            "ai_feedback": "Unanswered",
            "ai_justification": f"Expected: {official_key_set}, Got: {student_resp_set}",
            "ai_confidence_level": 1.0,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }
    
    if student_resp_set == official_key_set:
        return {
            "status": "completed",
            "evaluator_model": "deterministic",
            "ai_assigned_marks": max_marks,
            "ai_feedback": "Correct",
            "ai_justification": f"Exact match. Expected: {official_key_set}, Got: {student_resp_set}",
            "ai_confidence_level": 1.0,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }
    else:
        return {
            "status": "completed",
            "evaluator_model": "deterministic",
            "ai_assigned_marks": 0.0,
            "ai_feedback": "Incorrect",
            "ai_justification": f"Mismatch. Expected: {official_key_set}, Got: {student_resp_set}",
            "ai_confidence_level": 1.0,
            "evaluated_at": datetime.now(timezone.utc).isoformat()
        }
