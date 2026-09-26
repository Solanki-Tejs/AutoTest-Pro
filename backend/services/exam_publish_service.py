from datetime import datetime, timezone
from sqlalchemy.orm import Session
from services import exam_service, exam_blueprint_service, question_bank_service, answer_bank_service
from schemas.exam_schema import ExamUpdate

def validate_and_publish_exam(exam_id: str, teacher_id: int, start_time: datetime, end_time: datetime, db: Session) -> dict:
    exam = exam_service.get_exam_by_id(exam_id, db)

    if not exam:
        raise ValueError("Exam not found")
        
    # If the exam is already published, we are doing a "republish" which only updates dates.
    if exam.get("status") == "published":
        from services.student_exam_service import has_exam_attempts
        if has_exam_attempts(exam_id, db):
            raise ValueError("Cannot modify schedule. Students have already started taking this exam.")
            
    # Apply the date to the exam dict to validate it properly below.
    exam["start_time"] = start_time.replace(tzinfo=None)
    exam["end_time"] = end_time.replace(tzinfo=None)

    from services import syllabus_service
    # 0. Validate Syllabus
    available_syllabuses = syllabus_service.get_available_syllabuses_for_exam(teacher_id, db)
    available_ids = {str(s["id"]) for s in available_syllabuses}
    for pdf_id in exam.get("selected_pdf_ids", []):
        if str(pdf_id) not in available_ids:
            raise ValueError(f"Syllabus {pdf_id} is not available or not fully processed (must be READY)")

    # 1. Validate Schedule
    start_time = exam.get("start_time")
    end_time = exam.get("end_time")
    duration = exam.get("duration_minutes")

    if not start_time or not end_time:
        raise ValueError("Start time and end time must be set")
    if not duration or duration <= 0:
        raise ValueError("Duration must be set and greater than 0")
        
    if start_time >= end_time:
        raise ValueError("Start time must be before end time")
        
    window_minutes = (end_time - start_time).total_seconds() / 60
    if window_minutes < duration:
        raise ValueError(f"Exam window ({window_minutes} minutes) must be at least the duration ({duration} minutes)")
        
    # Assume naive server time in UTC
    current_time = datetime.now(timezone.utc).replace(tzinfo=None)
    if start_time <= current_time:
        raise ValueError("Start time must be in the future")
    if end_time <= current_time:
        raise ValueError("End time must be in the future")

    # 2. Validate Blueprint
    blueprint = exam_blueprint_service.get_blueprint(exam_id)
    if not blueprint:
        raise ValueError("Exam blueprint is missing")
        
    if not exam_blueprint_service.validate_blueprint_marks(blueprint, exam["total_marks"]):
        raise ValueError(f"Blueprint total marks do not match exam total marks ({exam['total_marks']})")

    # 3. Validate Questions
    question_bank = question_bank_service.get_active_question_bank(exam_id)
    if not question_bank:
        raise ValueError("Question bank is missing")
    if question_bank.get("status") != "approved":
        raise ValueError("Question bank must be approved before publishing")
        
    total_q_marks = 0
    actual_question_counts = {}
    
    sections = question_bank.get("question_body", {}).get("sections", [])
    for section in sections:
        sec_id = section.get("section_id")
        actual_question_counts[sec_id] = 0
        for q in section.get("questions", []):
            mark = q.get("mark", 0)
            total_q_marks += mark
            actual_question_counts[sec_id] += 1
            
    if total_q_marks != exam["total_marks"]:
        raise ValueError(f"Question paper total ({total_q_marks}) does not match exam total ({exam['total_marks']})")

    # Validate against blueprint
    # for sec in blueprint.sections:
    #     expected = sec.count
    #     actual = actual_question_counts.get(sec.section_id, 0)
    #     if expected != actual:
    #         raise ValueError(f"Section {sec.section} expects {expected} questions but has {actual}")

    # 4. Validate Answers
    answer_bank = answer_bank_service.get_active_answer_bank(exam_id)
    if not answer_bank:
        raise ValueError("Answer bank is missing")
        
    answers = answer_bank.get("answer_body", [])
    answer_map = {ans.get("question_id"): ans for ans in answers}
    
    for section in sections:
        for q in section.get("questions", []):
            qid = q.get("question_id")
            ans = answer_map.get(qid)
            if not ans:
                raise ValueError(f"Question {qid} is missing an answer")
            if ans.get("is_stale"):
                raise ValueError(f"Answer for question {qid} is stale. Please update it.")

    # 5. Approve answers and Publish exam
    answer_bank_service.update_answer_bank(exam_id, {"status": "approved"})
    
    updated_exam = exam_service.update_exam(
        exam_id, 
        ExamUpdate(
            status="published",
            start_time=exam["start_time"],
            end_time=exam["end_time"]
        ), 
        db
    )
    
    return updated_exam
