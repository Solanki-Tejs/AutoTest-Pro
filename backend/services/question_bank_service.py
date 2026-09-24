from databases.mongo import get_mongo_db
from schemas.question_bank_schema import QuestionBankResponse, QuestionUpdateSchema
from datetime import datetime, timezone
from bson.objectid import ObjectId
from services.answer_bank_service import mark_answer_stale

def get_active_question_bank(exam_id: str) -> dict | None:
    db = get_mongo_db()
    qb = db.question_bank.find_one(
        {"exam_id": exam_id, "is_active": True},
        sort=[("version", -1)]
    )
    if not qb:
        return None
    qb["_id"] = str(qb["_id"])
    return qb

def save_question_bank(qb_data: dict) -> str:
    db = get_mongo_db()
    if "_id" in qb_data:
        del qb_data["_id"]
    
    qb_data["updated_at"] = datetime.now(timezone.utc)
    if "created_at" not in qb_data:
        qb_data["created_at"] = datetime.now(timezone.utc)
        
    result = db.question_bank.insert_one(qb_data)
    return str(result.inserted_id)

def update_question_bank(exam_id: str, version: int, updates: dict):
    db = get_mongo_db()
    updates["updated_at"] = datetime.now(timezone.utc)
    db.question_bank.update_one(
        {"exam_id": exam_id, "version": version},
        {"$set": updates}
    )

def edit_question(exam_id: str, question_id: str, updates: QuestionUpdateSchema, user_id: int) -> bool:
    db = get_mongo_db()
    qb = db.question_bank.find_one({"exam_id": exam_id, "is_active": True})
    if not qb:
        return False
        
    updated = False
    for section in qb.get("question_body", {}).get("sections", []):
        for question in section.get("questions", []):
            if question.get("question_id") == question_id:
                # Apply updates
                if updates.question_text is not None:
                    question["question_text"] = updates.question_text
                if updates.bloom_level is not None:
                    question["bloom_level"] = updates.bloom_level
                if updates.mark is not None:
                    question["mark"] = updates.mark
                if updates.options is not None:
                    question["options"] = [opt.dict() for opt in updates.options]
                if updates.correct_answer is not None:
                    question["correct_answer"] = updates.correct_answer
                    
                question["is_edited"] = True
                question["edited_at"] = datetime.now(timezone.utc)
                question["edited_by"] = user_id
                updated = True
                break
        if updated:
            break
            
    if updated:
        db.question_bank.update_one(
            {"_id": ObjectId(qb["_id"])},
            {"$set": {"question_body": qb["question_body"], "updated_at": datetime.now(timezone.utc)}}
        )
        try:
            mark_answer_stale(exam_id, question_id)
        except Exception as e:
            print(f"Error marking answer stale: {e}")
        return True
    return False

def delete_question(exam_id: str, question_id: str) -> bool:
    db = get_mongo_db()
    qb = db.question_bank.find_one({"exam_id": exam_id, "is_active": True})
    if not qb:
        return False
        
    updated = False
    for section in qb.get("question_body", {}).get("sections", []):
        original_len = len(section.get("questions", []))
        section["questions"] = [q for q in section.get("questions", []) if q.get("question_id") != question_id]
        if len(section["questions"]) < original_len:
            updated = True
            break
            
    if updated:
        db.question_bank.update_one(
            {"_id": ObjectId(qb["_id"])},
            {"$set": {"question_body": qb["question_body"], "updated_at": datetime.now(timezone.utc)}}
        )
        return True
    return False

def get_generation_status(exam_id: str) -> dict | None:
    db = get_mongo_db()
    status = db.generation_jobs.find_one({"exam_id": exam_id})
    if status:
        status["_id"] = str(status["_id"])
    return status

def set_generation_status(exam_id: str, status: str, progress: int = None, current_section: str = None):
    db = get_mongo_db()
    update_doc = {
        "status": status,
        "updated_at": datetime.now(timezone.utc)
    }
    if progress is not None:
        update_doc["progress"] = progress
    if current_section is not None:
        update_doc["current_section"] = current_section
        
    db.generation_jobs.update_one(
        {"exam_id": exam_id},
        {"$set": update_doc},
        upsert=True
    )
