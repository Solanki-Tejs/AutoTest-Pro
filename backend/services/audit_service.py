from databases.mongo import get_mongo_db
from datetime import datetime, timezone
import uuid

def log_audit_event(user_id: int, action: str, entity_type: str, entity_id: str, details: dict = None):
    """
    Logs an audit event to the database.
    :param user_id: ID of the user performing the action
    :param action: A string describing the action (e.g. "EXAM_PUBLISHED", "BLUEPRINT_SAVED")
    :param entity_type: The type of entity being affected (e.g. "EXAM", "BLUEPRINT", "QUESTION_BANK")
    :param entity_id: The ID of the entity
    :param details: Optional JSON serializable dictionary with extra context
    """
    db = get_mongo_db()
    
    event = {
        "event_id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc)
    }
    
    db.audit_logs.insert_one(event)

def get_audit_logs_for_entity(entity_type: str, entity_id: str) -> list[dict]:
    db = get_mongo_db()
    logs = list(db.audit_logs.find({"entity_type": entity_type, "entity_id": entity_id}).sort("timestamp", -1))
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs
