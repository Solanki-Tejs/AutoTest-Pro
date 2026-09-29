from databases.mongo import get_mongo_db
from databases.database import SessionLocal
from services.question_bank_service import get_active_question_bank
from services.answer_bank_service import get_active_answer_bank
from services.objective_evaluator import evaluate_objective
from services.subjective_evaluator import evaluate_subjective
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

def evaluate_submission(attempt_id: str, exam_id: str):
    db = SessionLocal()
    mongo_db = get_mongo_db()
    
    try:
        # Load submission
        submission = mongo_db.exam_attempt_answers.find_one({"attempt_id": attempt_id})
        if not submission:
            logger.error(f"Submission not found for attempt {attempt_id}")
            return
            
        answers = submission.get("answers", [])
        
        # Load question bank
        qb = get_active_question_bank(exam_id)
        if not qb:
            logger.error(f"Question bank not found for exam {exam_id}")
            return
            
        q_map = {}
        for section in qb.get("question_body", {}).get("sections", []):
            for q in section.get("questions", []):
                q_map[q["question_id"]] = q
                
        # Load answer bank
        ab = get_active_answer_bank(exam_id)
        a_map = {}
        if ab:
            for ans in ab.get("answer_body", []):
                a_map[ans["question_id"]] = ans
                
        total_marks = 0.0
        max_marks = 0.0
        all_completed = True
        
        updated_answers = []
        # Convert answers to map for quick lookup
        ans_map = {ans.get("question_id"): ans for ans in answers}
        
        for qid, q_meta in q_map.items():
            ans = ans_map.get(qid)
            if not ans:
                ans = {
                    "question_id": qid,
                    "answer_text": None,
                    "evaluation": {
                        "status": "pending",
                        "evaluator_model": None,
                        "ai_assigned_marks": None,
                        "ai_feedback": None,
                        "ai_justification": None,
                        "ai_confidence_level": None,
                        "teacher_override_marks": None,
                        "teacher_feedback": None,
                        "modified_by_teacher": False,
                        "evaluated_at": None,
                        "reviewed_by": None,
                        "reviewed_at": None,
                        "override_reason": None,
                        "error_code": None
                    }
                }
            
            a_meta = a_map.get(qid, {})
            
            # Use appropriate evaluator based on question type
            q_type = q_meta.get("type", "").lower()
            
            eval_state = ans.get("evaluation", {}).get("status", "pending")
            
            if eval_state == "pending":
                try:
                    if q_type in ["mcq", "true_false", "fill_in_blanks", "multiple_select"]:
                        res = evaluate_objective(ans, a_meta, q_meta)
                    else:
                        res = evaluate_subjective(ans, a_meta, q_meta)
                except Exception as e:
                    res = {
                        "status": "failed",
                        "error_code": str(e)
                    }
                
                # Update answer with evaluation
                if "evaluation" not in ans:
                    ans["evaluation"] = {}
                ans["evaluation"].update(res)
            
            updated_answers.append(ans)
            
            if ans["evaluation"]["status"] in ["completed", "needs_review"]:
                total_marks += float(ans["evaluation"].get("ai_assigned_marks") or 0.0)
                max_marks += float(q_meta.get("mark", 1))
            else:
                all_completed = False

        # Save evaluations back to mongo
        mongo_db.exam_attempt_answers.update_one(
            {"attempt_id": attempt_id},
            {"$set": {"answers": updated_answers}}
        )

        if all_completed:
            # Update Postgres status to evaluated
            update_query = text("""
                UPDATE exam_attempts
                SET status = 'evaluated', total_marks = :total_marks, max_marks = :max_marks, evaluated_at = NOW()
                WHERE id = :attempt_id
            """)
            db.execute(update_query, {
                "total_marks": total_marks,
                "max_marks": max_marks,
                "attempt_id": attempt_id
            })
            db.commit()

    except Exception as e:
        logger.error(f"Error evaluating attempt {attempt_id}: {e}")
    finally:
        db.close()
