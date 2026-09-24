from databases.mongo import get_mongo_db
from datetime import datetime, timezone
from bson.objectid import ObjectId

def get_active_answer_bank(exam_id: str) -> dict | None:
    db = get_mongo_db()
    ab = db.answer_bank.find_one(
        {"exam_id": exam_id, "is_active": True},
        sort=[("question_bank_version", -1)]
    )
    if not ab:
        return None
    ab["_id"] = str(ab["_id"])
    return ab

def save_answer_bank(ab_data: dict) -> str:
    db = get_mongo_db()
    if "_id" in ab_data:
        del ab_data["_id"]
    
    ab_data["updated_at"] = datetime.now(timezone.utc)
    if "created_at" not in ab_data:
        ab_data["created_at"] = datetime.now(timezone.utc)
        
    result = db.answer_bank.insert_one(ab_data)
    return str(result.inserted_id)

def update_answer_bank(exam_id: str, updates: dict):
    db = get_mongo_db()
    updates["updated_at"] = datetime.now(timezone.utc)
    db.answer_bank.update_one(
        {"exam_id": exam_id, "is_active": True},
        {"$set": updates}
    )

def edit_answer(exam_id: str, answer_id: str, answer_key: str | None, answer_text: str | None) -> bool:
    db = get_mongo_db()
    ab = db.answer_bank.find_one({"exam_id": exam_id, "is_active": True})
    if not ab:
        return False
        
    updated = False
    for ans in ab.get("answer_body", []):
        if ans.get("answer_id") == answer_id:
            if answer_key is not None:
                ans["answer_key"] = answer_key
            if answer_text is not None:
                ans["answer_text"] = answer_text
                
            ans["is_edited"] = True
            ans["updated_at"] = datetime.now(timezone.utc)
            updated = True
            break
            
    if updated:
        db.answer_bank.update_one(
            {"_id": ObjectId(ab["_id"])},
            {"$set": {"answer_body": ab["answer_body"], "updated_at": datetime.now(timezone.utc)}}
        )
        return True
    return False

def get_answer_generation_status(exam_id: str) -> dict | None:
    db = get_mongo_db()
    status = db.answer_generation_jobs.find_one({"exam_id": exam_id})
    if status:
        status["_id"] = str(status["_id"])
    return status

def set_answer_generation_status(exam_id: str, status: str, total_questions: int = None, generated_questions: int = None, failed_questions: int = None, progress: int = None):
    db = get_mongo_db()
    update_doc = {
        "status": status,
        "updated_at": datetime.now(timezone.utc)
    }
    if total_questions is not None:
        update_doc["total_questions"] = total_questions
    if generated_questions is not None:
        update_doc["generated_questions"] = generated_questions
    if failed_questions is not None:
        update_doc["failed_questions"] = failed_questions
    if progress is not None:
        update_doc["progress"] = progress
        
    db.answer_generation_jobs.update_one(
        {"exam_id": exam_id},
        {"$set": update_doc},
        upsert=True
    )

def mark_answer_stale(exam_id: str, question_id: str):
    db = get_mongo_db()
    ab = db.answer_bank.find_one({"exam_id": exam_id, "is_active": True})
    if not ab:
        return
        
    updated = False
    for ans in ab.get("answer_body", []):
        if ans.get("question_id") == question_id:
            ans["is_stale"] = True
            ans["updated_at"] = datetime.now(timezone.utc)
            updated = True
            
    if updated:
        db.answer_bank.update_one(
            {"_id": ObjectId(ab["_id"])},
            {"$set": {"answer_body": ab["answer_body"], "updated_at": datetime.now(timezone.utc)}}
        )
