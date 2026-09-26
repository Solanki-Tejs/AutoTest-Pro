from databases.mongo import get_mongo_db
from schemas.blueprint_schema import BlueprintCreate, BlueprintResponse, SectionResponse
import uuid
from datetime import datetime

def get_blueprint(exam_id: str) -> BlueprintResponse | None:
    db = get_mongo_db()
    blueprint = db.exam_question_blueprint.find_one({"exam_id": exam_id})
    if not blueprint:
        return None
    
    sections = []
    total_marks = 0
    for sec in blueprint.get("sections", []):
        section_marks = sec["count"] * sec["marks_each"]
        total_marks += section_marks
        sections.append(SectionResponse(
            section_id=sec["section_id"],
            section=sec["section"],
            type=sec["type"],
            count=sec["count"],
            marks_each=sec["marks_each"],
            order=sec.get("order", 0),
            total_marks=section_marks
        ))
    
    return BlueprintResponse(
        exam_id=exam_id,
        total_marks=total_marks,
        version=blueprint.get("version", 1),
        sections=sections
    )

def create_or_update_blueprint(exam_id: str, blueprint_data: BlueprintCreate) -> BlueprintResponse:
    db = get_mongo_db()
    
    # Check if blueprint already exists
    existing = db.exam_question_blueprint.find_one({"exam_id": exam_id})
    
    sections_doc = []
    total_marks = 0
    
    for sec in blueprint_data.sections:
        section_id = str(uuid.uuid4())
        sections_doc.append({
            "section_id": section_id,
            "section": sec.section,
            "type": sec.type,
            "count": sec.count,
            "marks_each": sec.marks_each,
            "order": sec.order if sec.order is not None else 0
        })
        total_marks += sec.count * sec.marks_each
        
    if existing and blueprint_data.version is not None:
        if existing.get("version", 1) != blueprint_data.version:
            raise ValueError(f"Version conflict: Client version {blueprint_data.version}, Database version {existing.get('version', 1)}")

    new_version = existing.get("version", 0) + 1 if existing else 1
    
    doc = {
        "exam_id": exam_id,
        "total_marks": total_marks,
        "sections": sections_doc,
        "version": new_version,
        "updated_at": datetime.utcnow()
    }
    
    if existing:
        db.exam_question_blueprint.update_one(
            {"exam_id": exam_id},
            {"$set": doc}
        )
    else:
        doc["created_at"] = datetime.utcnow()
        # The unique index on exam_id will prevent duplicates
        db.exam_question_blueprint.insert_one(doc)
        
    return get_blueprint(exam_id)

def validate_blueprint_marks(blueprint_data: BlueprintCreate, exam_total_marks: int) -> bool:
    calculated_total = sum(sec.count * sec.marks_each for sec in blueprint_data.sections)
    return calculated_total == exam_total_marks

