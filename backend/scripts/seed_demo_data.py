import sys
import os
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

from databases.database import SessionLocal
from databases.mongo import get_mongo_db
from core.security import hash_password
from services.student_exam_service import ensure_tables
from sqlalchemy import text

DEMO_PASSWORD = "Test@123"

def run_seed():
    db = SessionLocal()
    mongo = get_mongo_db()
    ensure_tables(db)
    
    print("=" * 60)
    print("AutoTest Pro - Seeding Comprehensive Demo Environment")
    print("=" * 60)

    hashed_pw = hash_password(DEMO_PASSWORD)
    now = datetime.now(timezone.utc)

    # -------------------------------------------------------------
    # 1. USERS
    # -------------------------------------------------------------
    print("\n[1/7] Seeding Users...")
    users_to_seed = [
        {"name": "System Administrator", "email": "admin@autotest.pro", "role": "admin"},
        {"name": "Prof. Alan Turing", "email": "prof.turing@autotest.pro", "role": "teacher"},
        {"name": "Alex Chen", "email": "alex.chen@student.edu", "role": "student"},
        {"name": "Priya Patel", "email": "priya.patel@student.edu", "role": "student"},
        {"name": "Jordan Lee", "email": "jordan.lee@student.edu", "role": "student"},
        {"name": "Marcus Vance", "email": "marcus.vance@student.edu", "role": "student"},
        {"name": "Sarah Jenkins", "email": "sarah.jenkins@student.edu", "role": "student"},
        {"name": "Rohit Verma", "email": "rohit.verma@student.edu", "role": "student"},
        {"name": "Elena Rostova", "email": "elena.rostova@student.edu", "role": "student"},
        {"name": "David Kim", "email": "david.kim@student.edu", "role": "student"},
    ]

    # Also update existing users password to DEMO_PASSWORD so user can log into any account
    for email in ["tech1@mail.com", "stud1@mail.com", "p.1023viren@gmail.com"]:
        db.execute(
            text("UPDATE users SET password_hash = :pw WHERE email = :email"),
            {"pw": hashed_pw, "email": email}
        )

    user_map = {}
    for u in users_to_seed:
        existing = db.execute(
            text("SELECT id, name, role FROM users WHERE email = :email"),
            {"email": u["email"]}
        ).fetchone()
        
        if existing:
            db.execute(
                text("UPDATE users SET password_hash = :pw, name = :name, role = :role WHERE id = :id"),
                {"pw": hashed_pw, "name": u["name"], "role": u["role"], "id": existing[0]}
            )
            user_map[u["email"]] = existing[0]
            print(f"  * Updated user: {u['name']} ({u['email']}) -> ID {existing[0]}")
        else:
            ins = db.execute(
                text("""
                    INSERT INTO users (name, email, password_hash, role, created_at)
                    VALUES (:name, :email, :pw, :role, :now)
                    RETURNING id
                """),
                {"name": u["name"], "email": u["email"], "pw": hashed_pw, "role": u["role"], "now": now}
            ).fetchone()
            user_map[u["email"]] = ins[0]
            print(f"  * Created user: {u['name']} ({u['email']}) -> ID {ins[0]}")

    # Fetch existing users
    for row in db.execute(text("SELECT id, email FROM users")).fetchall():
        user_map[row[1]] = row[0]

    db.commit()

    # -------------------------------------------------------------
    # 2. CLASSES
    # -------------------------------------------------------------
    print("\n[2/7] Seeding Classes...")
    teacher_1_id = user_map.get("tech1@mail.com", 2)
    teacher_2_id = user_map.get("prof.turing@autotest.pro", teacher_1_id)

    classes_data = [
        {"id": 2, "name": "Natural Language Processing (NLP)", "description": "Core NLP concepts, morphology, syntax, NLU, and neural language models.", "teacher_id": teacher_1_id, "join_code": "V33YR6PS"},
        {"id": 3, "name": "Data Warehousing & BI", "description": "Data Marts, ETL Pipelines, OLAP vs OLTP architectures, and Star/Snowflake schemas.", "teacher_id": teacher_1_id, "join_code": "ZK78CQSD"},
        {"id": 4, "name": "Cyber Security & Networks", "description": "Threat modeling, cryptography, perimeter defense, and intrusion detection systems.", "teacher_id": teacher_2_id, "join_code": "WE7HEC3Z"},
    ]

    for c in classes_data:
        existing = db.execute(text("SELECT id FROM classes WHERE id = :id"), {"id": c["id"]}).fetchone()
        if existing:
            db.execute(
                text("UPDATE classes SET name = :name, description = :desc, teacher_id = :tid, join_code = :code WHERE id = :id"),
                {"name": c["name"], "desc": c["description"], "tid": c["teacher_id"], "code": c["join_code"], "id": c["id"]}
            )
            print(f"  * Updated class: {c['name']} (Code: {c['join_code']})")
        else:
            db.execute(
                text("""
                    INSERT INTO classes (id, name, description, teacher_id, join_code, created_at)
                    VALUES (:id, :name, :desc, :tid, :code, :now)
                """),
                {"id": c["id"], "name": c["name"], "desc": c["description"], "tid": c["teacher_id"], "code": c["join_code"], "now": now}
            )
            print(f"  * Inserted class: {c['name']} (Code: {c['join_code']})")

    db.commit()

    # -------------------------------------------------------------
    # 3. CLASS ENROLLMENTS
    # -------------------------------------------------------------
    print("\n[3/7] Seeding Class Enrollments...")
    # NLP (Class 2) Enrollments
    nlp_approved_students = ["stud1@mail.com", "alex.chen@student.edu", "priya.patel@student.edu", "jordan.lee@student.edu", "marcus.vance@student.edu", "sarah.jenkins@student.edu", "david.kim@student.edu"]
    nlp_pending_students = ["rohit.verma@student.edu"]

    # Data Warehousing (Class 3) Enrollments
    dw_approved_students = ["p.1023viren@gmail.com", "stud1@mail.com", "alex.chen@student.edu", "priya.patel@student.edu", "jordan.lee@student.edu", "david.kim@student.edu"]
    dw_pending_students = ["elena.rostova@student.edu"]

    # Cyber Security (Class 4) Enrollments
    cs_approved_students = ["alex.chen@student.edu", "jordan.lee@student.edu", "elena.rostova@student.edu"]
    cs_pending_students = ["marcus.vance@student.edu", "sarah.jenkins@student.edu"]

    enrollment_matrix = [
        (2, nlp_approved_students, "approved"),
        (2, nlp_pending_students, "pending"),
        (3, dw_approved_students, "approved"),
        (3, dw_pending_students, "pending"),
        (4, cs_approved_students, "approved"),
        (4, cs_pending_students, "pending"),
    ]

    for class_id, email_list, status in enrollment_matrix:
        for em in email_list:
            sid = user_map.get(em)
            if not sid:
                continue
            exists = db.execute(
                text("SELECT id FROM class_enrollments WHERE class_id = :cid AND student_id = :sid"),
                {"cid": class_id, "sid": sid}
            ).fetchone()
            if exists:
                db.execute(
                    text("UPDATE class_enrollments SET status = :status WHERE id = :id"),
                    {"status": status, "id": exists[0]}
                )
            else:
                db.execute(
                    text("INSERT INTO class_enrollments (class_id, student_id, status, created_at) VALUES (:cid, :sid, :status, :now)"),
                    {"cid": class_id, "sid": sid, "status": status, "now": now - timedelta(days=7)}
                )
    db.commit()
    print("  * Enrolled students across NLP, Data Warehousing, and Cyber Security with approved & pending statuses.")

    # -------------------------------------------------------------
    # 4. EXAMS SETUP & SCHEDULE
    # -------------------------------------------------------------
    print("\n[4/7] Updating Exams Configuration...")
    nlp_exam_id = "2fbd00e6-54e3-4818-a34b-6cf92b199c81"
    dw_exam_id = "26d21979-a2ba-4d73-9e13-7c679e32d7a0"
    cs_exam_id = "73630dd6-73ac-4fbd-85ba-17d38343c7ed"

    # NLP Exam: Published, past/ongoing window
    db.execute(
        text("""
            UPDATE exams
            SET title = 'NLP Sessional Assessment',
                status = 'published',
                total_marks = 25,
                duration_minutes = 45,
                difficulty = 'medium',
                start_time = :st,
                end_time = :et
            WHERE id = :id
        """),
        {
            "st": (now - timedelta(days=4)).replace(tzinfo=None),
            "et": (now + timedelta(days=10)).replace(tzinfo=None),
            "id": nlp_exam_id
        }
    )

    # Data Warehousing Exam: Published and active for students to take live!
    db.execute(
        text("""
            UPDATE exams
            SET title = 'Data Warehousing Midterm Examination',
                status = 'published',
                total_marks = 50,
                duration_minutes = 60,
                difficulty = 'hard',
                start_time = :st,
                end_time = :et
            WHERE id = :id
        """),
        {
            "st": (now - timedelta(hours=2)).replace(tzinfo=None),
            "et": (now + timedelta(days=14)).replace(tzinfo=None),
            "id": dw_exam_id
        }
    )

    # Set MongoDB question bank active flags for Data Warehousing
    mongo.question_bank.update_many({"exam_id": dw_exam_id}, {"$set": {"is_active": False}})
    mongo.question_bank.update_one({"exam_id": dw_exam_id, "version": 2}, {"$set": {"is_active": True, "status": "approved"}})

    # Cyber Security Exam: Ready (blueprint and questions generated, ready to publish)
    db.execute(
        text("""
            UPDATE exams
            SET class_id = 4,
                title = 'Cyber Security Fundamentals Quiz',
                status = 'ready',
                total_marks = 30,
                duration_minutes = 30,
                difficulty = 'medium',
                start_time = :st,
                end_time = :et
            WHERE id = :id
        """),
        {
            "st": (now + timedelta(days=1)).replace(tzinfo=None),
            "et": (now + timedelta(days=7)).replace(tzinfo=None),
            "id": cs_exam_id
        }
    )

    db.commit()
    print("  * Exam 1: NLP Sessional Assessment (Published, multiple evaluated attempts)")
    print("  * Exam 2: Data Warehousing Midterm Examination (Published, ready for live test-taking)")
    print("  * Exam 3: Cyber Security Fundamentals Quiz (Ready state, ready to demo publishing)")

    # -------------------------------------------------------------
    # 5. ATTEMPTS & EVALUATIONS FOR NLP EXAM
    # -------------------------------------------------------------
    print("\n[5/7] Seeding Realistic Student Attempts & AI Evaluations...")

    # Load questions from question bank for exact question_ids
    qb_doc = mongo.question_bank.find_one({"exam_id": nlp_exam_id, "is_active": True})
    if not qb_doc:
        qb_doc = mongo.question_bank.find_one({"exam_id": nlp_exam_id})

    questions = []
    if qb_doc:
        for sec in qb_doc.get("question_body", {}).get("sections", []):
            for q in sec.get("questions", []):
                questions.append(q)

    # Question IDs:
    # 10 MCQs: 80b0ea98, 14708068, 4172a2d8, 7db2c3ad, 65c6c3fb, fd85a407, 73c4dba7, 1985fe27, c0bbf7eb, 89cef29c
    # 5 Short: 8e9fc2f9, 509230f5, b2027cf5, 1101fe26, a51c44cc
    # 1 Long: bda1fba8
    
    mcq_answers_alex = ["C", "B", "C", "C", "B", "C", "C", "C", "B", "D"] # 10/10 correct
    mcq_answers_priya = ["C", "B", "C", "A", "B", "C", "C", "B", "B", "D"] # 8/10 correct
    mcq_answers_marcus = ["A", "B", "A", "C", "D", "A", "C", "A", "D", "A"] # 3/10 correct
    mcq_answers_sarah = ["C", "B", "C", "C", "B", "C", "A", "C", "B", "D"] # 9/10 correct

    def make_eval(score, feedback, justification, model="gemini-2.5-pro", override=None, reason=None):
        return {
            "status": "completed",
            "evaluator_model": model,
            "ai_assigned_marks": float(score),
            "ai_feedback": feedback,
            "ai_justification": justification,
            "ai_confidence_level": 0.95,
            "teacher_override_marks": float(override) if override is not None else None,
            "teacher_feedback": f"Teacher note: {reason}" if reason else None,
            "modified_by_teacher": override is not None,
            "evaluated_at": (now - timedelta(days=2)).isoformat(),
            "reviewed_by": teacher_1_id if override is not None else None,
            "reviewed_at": (now - timedelta(days=1)).isoformat() if override is not None else None,
            "override_reason": reason,
            "error_code": None
        }

    # Attempt definitions
    attempt_profiles = [
        {
            "email": "alex.chen@student.edu",
            "status": "evaluated",
            "total_marks": Decimal("24.00"),
            "max_marks": Decimal("25.00"),
            "adjustment_marks": Decimal("0.00"),
            "started_offset_hours": 48,
            "duration_minutes": 38,
            "result_published": True,
            "mcq": mcq_answers_alex,
            "short_answers": [
                ("Inflectional morphology modifies word forms without changing grammatical category (e.g., walk -> walks), whereas derivational morphology forms new words or changes word category (e.g., compute -> computer).", 2.0, "Accurate and clear distinction with valid examples.", "Comprehensive coverage of both inflectional and derivational morphology."),
                ("Discourse integration interprets sentences within the broader context of surrounding sentences to maintain coherence and resolve global document structure.", 2.0, "Thorough explanation of context and coherence.", "Accurate understanding of discourse integration."),
                ("Feature engineering extracts measurable characteristics (like n-grams, POS tags, and TF-IDF weights) from raw text to train machine learning models effectively.", 2.0, "Excellent identification of NLP feature sets.", "Strong technical understanding."),
                ("Word-sense disambiguation determines which meaning of an ambiguous word is intended in a particular context (e.g., bank as financial institution vs river bank).", 2.0, "Precise definition with canonical example.", "Clear demonstration of ambiguity resolution."),
                ("Two core tasks are Tokenization (segmenting text into tokens) and Stemming/Lemmatization (reducing words to their base roots).", 2.0, "Both core tasks correctly identified and explained.", "Valid lexical tasks provided.")
            ],
            "long_answer": ("The five core phases of NLP are: 1. Lexical/Morphological Analysis (analyzing word structure and tokenization), 2. Syntactic Analysis (parsing grammatical tree structures), 3. Semantic Analysis (determining literal meaning and word senses), 4. Discourse Integration (interpreting meaning across connected sentences), and 5. Pragmatic Analysis (applying real-world context and intent). For example, recognizing that 'Can you pass the salt?' is a request rather than an ability query belongs to the pragmatic phase.", 4.0, "Outstanding breakdown of all 5 phases with insightful pragmatic example.", "All 5 stages clearly explained with high fidelity."),
            "override": None,
            "violations": []
        },
        {
            "email": "priya.patel@student.edu",
            "status": "evaluated",
            "total_marks": Decimal("17.00"),
            "max_marks": Decimal("25.00"),
            "adjustment_marks": Decimal("0.00"),
            "started_offset_hours": 45,
            "duration_minutes": 42,
            "result_published": True,
            "mcq": mcq_answers_priya,
            "short_answers": [
                ("Inflectional changes tense like walk to walked. Derivational creates a new word like happy to unhappiness.", 1.5, "Good examples, could explain category change more explicitly.", "Partial grammatical explanation provided."),
                ("Discourse integration connects the sentence meaning to previous sentences in a document.", 1.5, "Good basic definition of discourse context.", "Understands the core goal."),
                ("Extracting features like word counts and TF-IDF from text for ML classifiers.", 1.5, "Mentions key features though briefly.", "Solid understanding."),
                ("Word sense disambiguation finds which word meaning is used when a word has multiple meanings.", 1.5, "Correct concept, could use a specific example.", "Understands polysemy resolution."),
                ("Tokenization and Part-of-Speech tagging.", 1.5, "Identified tokenization and POS tagging.", "Valid tasks.")
            ],
            "long_answer": ("NLP has five phases: Lexical analysis breaks text into tokens and analyzes words. Syntactic parsing analyzes sentence structure and grammar rules. Semantic analysis extracts literal meaning. Discourse integration looks at multi-sentence context. Pragmatic analysis understands what the speaker actually means based on the world context.", 3.0, "Accurate overview of the 5 phases, though lacking concrete illustrative examples for each phase.", "Sound conceptual understanding."),
            "override": None,
            "violations": [
                {"eventType": "WINDOW_BLUR", "desc": "Browser window lost focus briefly (notification pop-up).", "duration": 3}
            ]
        },
        {
            "email": "marcus.vance@student.edu",
            "status": "evaluated",
            "total_marks": Decimal("8.00"),
            "max_marks": Decimal("25.00"),
            "adjustment_marks": Decimal("-5.00"), # 5 marks deduction due to cheating violations!
            "started_offset_hours": 40,
            "duration_minutes": 25,
            "result_published": True,
            "mcq": mcq_answers_marcus,
            "short_answers": [
                ("Inflectional is grammar and derivational is different word.", 0.5, "Vague explanation without formal concepts.", "Lacks depth and examples."),
                ("Understanding discourse.", 0.5, "Tautological answer.", "Fails to explain objective."),
                ("Converting words to numbers.", 1.0, "Very basic description of vectorization.", "Oversimplified."),
                ("Disambiguation of words.", 0.0, "Repeats question prompt without explanation.", "No substance."),
                ("Reading text and cleaning words.", 0.5, "Very generic.", "Missing specific lexical tasks.")
            ],
            "long_answer": ("Phases are syntax, semantics, and words. It helps machines talk to people.", 1.5, "Incomplete. Only 2 phases mentioned with little detail.", "Severe omissions."),
            "override": None,
            "violations": [
                {"eventType": "TAB_SWITCH", "desc": "Student switched tabs to external search engine.", "duration": 18},
                {"eventType": "WINDOW_BLUR", "desc": "Browser window lost focus.", "duration": 22},
                {"eventType": "TAB_SWITCH", "desc": "Tab switch detected while on Section B.", "duration": 14},
                {"eventType": "MULTIPLE_FACES", "desc": "Secondary face detected beside student.", "duration": 8},
                {"eventType": "FACE_ABSENT", "desc": "Student face absent from camera frame for >10s.", "duration": 15},
                {"eventType": "TAB_SWITCH", "desc": "Student switched tabs to external reference document.", "duration": 25},
                {"eventType": "WINDOW_BLUR", "desc": "Browser window unfocused.", "duration": 10},
                {"eventType": "FACE_ABSENT", "desc": "Face disappeared from frame.", "duration": 12},
                {"eventType": "TAB_SWITCH", "desc": "Tab switch detected during Section C.", "duration": 30},
            ]
        },
        {
            "email": "sarah.jenkins@student.edu",
            "status": "evaluated",
            "total_marks": Decimal("20.00"),
            "max_marks": Decimal("25.00"),
            "adjustment_marks": Decimal("0.00"),
            "started_offset_hours": 30,
            "duration_minutes": 41,
            "result_published": False, # NOT YET PUBLISHED! Teacher can show review & publish workflow!
            "mcq": mcq_answers_sarah,
            "short_answers": [
                ("Inflectional morphology keeps the word's grammatical class (cat -> cats), whereas derivational morphology transforms the grammatical category or meaning (nation -> national).", 2.0, "Clear definition and good examples.", "Accurate distinction."),
                ("Discourse integration resolves references across sentences like anaphora resolution and maintains narrative flow.", 2.0, "Highlights anaphora resolution accurately.", "High quality discourse explanation."),
                ("Feature engineering builds representations such as BoW, n-grams, and embeddings that capture textual patterns.", 1.5, "Strong technical keywords.", "Solid answer."),
                ("Word-sense disambiguation selects the appropriate meaning of polysemous words based on neighboring context.", 2.0, "Direct, accurate answer.", "Accurate polysemy resolution."),
                ("Tokenization and morphological segmentation.", 1.5, "Correct lexical phase operations.", "Accurate.")
            ],
            "long_answer": ("The five phases of Natural Language Processing are: 1. Lexical/Morphological: Word boundaries, affixes, and lemmas. 2. Syntactic: Structural parse trees based on formal grammar. 3. Semantic: Literal meaning composition from individual tokens. 4. Discourse: Context across multiple adjacent sentences. 5. Pragmatic: Understanding implied intent based on real world facts and conversational conventions.", 4.0, "Excellent, structured summary of all 5 phases with crisp definitions.", "Clear and comprehensive."),
            "override": {"qid_idx": 4, "marks": 2.0, "reason": "Awarded full credit for precise morphological segmentation terminology"},
            "violations": []
        },
        {
            "email": "jordan.lee@student.edu",
            "status": "in_progress",
            "total_marks": None,
            "max_marks": Decimal("25.00"),
            "adjustment_marks": Decimal("0.00"),
            "started_offset_hours": 0.2, # started 12 mins ago
            "duration_minutes": None,
            "result_published": False,
            "mcq": ["C", "B", "C", "C"], # answered first 4 questions
            "short_answers": [],
            "long_answer": None,
            "override": None,
            "violations": []
        }
    ]

    for prof in attempt_profiles:
        sid = user_map.get(prof["email"])
        if not sid:
            continue

        started_at = now - timedelta(hours=prof["started_offset_hours"])
        deadline = started_at + timedelta(minutes=45)
        completed_at = started_at + timedelta(minutes=prof["duration_minutes"]) if prof["duration_minutes"] else None
        evaluated_at = completed_at + timedelta(seconds=15) if completed_at else None
        res_pub_at = (evaluated_at + timedelta(hours=2)) if (prof["result_published"] and evaluated_at) else None

        existing_att = db.execute(
            text("SELECT id FROM exam_attempts WHERE exam_id = :eid AND student_id = :sid"),
            {"eid": nlp_exam_id, "sid": sid}
        ).fetchone()

        if existing_att:
            att_id = existing_att[0]
            db.execute(
                text("""
                    UPDATE exam_attempts
                    SET started_at = :st, deadline = :dl, completed_at = :cat,
                        status = :stat, total_marks = :tm, max_marks = :mm,
                        adjustment_marks = :adj, evaluated_at = :eva, result_published_at = :rpa
                    WHERE id = :id
                """),
                {
                    "st": started_at, "dl": deadline, "cat": completed_at,
                    "stat": prof["status"], "tm": prof["total_marks"], "mm": prof["max_marks"],
                    "adj": prof["adjustment_marks"], "eva": evaluated_at, "rpa": res_pub_at,
                    "id": att_id
                }
            )
        else:
            att_id = uuid.uuid4()
            db.execute(
                text("""
                    INSERT INTO exam_attempts (id, exam_id, student_id, started_at, deadline, completed_at, status, total_marks, max_marks, adjustment_marks, evaluated_at, result_published_at)
                    VALUES (:id, :eid, :sid, :st, :dl, :cat, :stat, :tm, :mm, :adj, :eva, :rpa)
                """),
                {
                    "id": att_id, "eid": nlp_exam_id, "sid": sid, "st": started_at, "dl": deadline, "cat": completed_at,
                    "stat": prof["status"], "tm": prof["total_marks"], "mm": prof["max_marks"],
                    "adj": prof["adjustment_marks"], "eva": evaluated_at, "rpa": res_pub_at
                }
            )

        str_att_id = str(att_id)

        # Build Answers for MongoDB
        built_answers = []
        if questions:
            # 10 MCQs
            for idx, q in enumerate(questions[:10]):
                if idx < len(prof["mcq"]):
                    user_ans = prof["mcq"][idx]
                    correct_opt = "C" if idx in [0, 2, 3, 5, 6, 7] else ("B" if idx in [1, 4, 8] else "D")
                    is_correct = (user_ans == correct_opt)
                    
                    ans_doc = {
                        "question_id": q["question_id"],
                        "answer": user_ans,
                        "evaluation": {
                            "status": "completed",
                            "evaluator_model": "deterministic",
                            "ai_assigned_marks": 1.0 if is_correct else 0.0,
                            "ai_feedback": "Correct" if is_correct else f"Incorrect. Correct answer is option {correct_opt}.",
                            "ai_justification": f"Exact match with rubric key ({correct_opt})" if is_correct else f"Rubric expected {correct_opt}, student selected {user_ans}",
                            "ai_confidence_level": 1.0,
                            "teacher_override_marks": None,
                            "teacher_feedback": None,
                            "modified_by_teacher": False,
                            "evaluated_at": evaluated_at.isoformat() if evaluated_at else None,
                            "reviewed_by": None,
                            "reviewed_at": None,
                            "override_reason": None,
                            "error_code": None
                        }
                    }
                    built_answers.append(ans_doc)

            # 5 Short answers
            for idx, q in enumerate(questions[10:15]):
                if idx < len(prof["short_answers"]):
                    text_ans, score, feedback, just = prof["short_answers"][idx]
                    override_val = None
                    override_rsn = None
                    if prof.get("override") and prof["override"]["qid_idx"] == idx:
                        override_val = prof["override"]["marks"]
                        override_rsn = prof["override"]["reason"]
                        
                    ans_doc = {
                        "question_id": q["question_id"],
                        "answer": text_ans,
                        "evaluation": make_eval(score, feedback, just, override=override_val, reason=override_rsn)
                    }
                    built_answers.append(ans_doc)

            # 1 Long answer
            if len(questions) > 15 and prof.get("long_answer"):
                q = questions[15]
                text_ans, score, feedback, just = prof["long_answer"]
                ans_doc = {
                    "question_id": q["question_id"],
                    "answer": text_ans,
                    "evaluation": make_eval(score, feedback, just)
                }
                built_answers.append(ans_doc)

        # Upsert into Mongo exam_attempt_answers
        mongo.exam_attempt_answers.update_one(
            {"attempt_id": str_att_id},
            {
                "$set": {
                    "attempt_id": str_att_id,
                    "exam_id": nlp_exam_id,
                    "student_id": sid,
                    "answers": built_answers,
                    "submission_version": 1,
                    "submitted_at": completed_at.isoformat() if completed_at else None,
                    "updated_at": (completed_at or now).isoformat()
                }
            },
            upsert=True
        )

        # Proctoring Events in Mongo
        event_list = []
        for v in prof["violations"]:
            event_list.append({
                "event_id": str(uuid.uuid4()),
                "eventType": v["eventType"],
                "timestamp": (started_at + timedelta(minutes=15)).isoformat(),
                "details": {
                    "description": v["desc"],
                    "duration_seconds": v.get("duration", 10),
                    "snapshot_url": None,
                    "metadata": {}
                }
            })

        mongo.proctoring_events.update_one(
            {"attempt_id": str_att_id},
            {
                "$set": {
                    "attempt_id": str_att_id,
                    "exam_id": nlp_exam_id,
                    "student_id": sid,
                    "events": event_list
                }
            },
            upsert=True
        )

        print(f"  * Seeded attempt for {prof['email']} -> Score: {prof['total_marks']} (Adj: {prof['adjustment_marks']}), Status: {prof['status']}, Violations: {len(event_list)}")

    db.commit()

    # -------------------------------------------------------------
    # 6. NOTIFICATIONS
    # -------------------------------------------------------------
    print("\n[6/7] Seeding Notifications...")
    notifications_data = [
        # Teacher Notifications
        {
            "user_id": teacher_1_id,
            "type": "class",
            "title": "New Join Request",
            "message": "Rohit Verma has requested to join your class 'Natural Language Processing (NLP)'.",
            "status": "info",
            "link": "/teacher/dashboard",
            "is_read": False,
            "hours_ago": 2
        },
        {
            "user_id": teacher_1_id,
            "type": "class",
            "title": "New Join Request",
            "message": "Elena Rostova has requested to join your class 'Data Warehousing & BI'.",
            "status": "info",
            "link": "/teacher/dashboard",
            "is_read": False,
            "hours_ago": 4
        },
        {
            "user_id": teacher_1_id,
            "type": "exam",
            "title": "Exam Submission Ready for Review",
            "message": "Sarah Jenkins has submitted 'NLP Sessional Assessment'. AI grading is ready for your review.",
            "status": "info",
            "link": f"/teacher/exams/{nlp_exam_id}/results",
            "is_read": False,
            "hours_ago": 6
        },
        {
            "user_id": teacher_1_id,
            "type": "exam",
            "title": "High Proctoring Violations Flagged",
            "message": "Marcus Vance accumulated 9 anti-cheat violations during 'NLP Sessional Assessment'. Review recommended.",
            "status": "warning",
            "link": f"/teacher/exams/{nlp_exam_id}/results",
            "is_read": True,
            "hours_ago": 36
        },
        # Student Notifications
        {
            "user_id": user_map.get("alex.chen@student.edu"),
            "type": "result_published",
            "title": "Results Published: NLP Sessional Assessment",
            "message": "Your score for 'NLP Sessional Assessment' is available. You scored 24.00 / 25.00 (96%).",
            "status": "success",
            "link": f"/student/exams/{nlp_exam_id}/result",
            "is_read": False,
            "hours_ago": 12
        },
        {
            "user_id": user_map.get("alex.chen@student.edu"),
            "type": "exam_scheduled",
            "title": "New Exam Active: Data Warehousing Midterm",
            "message": "The exam 'Data Warehousing Midterm Examination' is now live. Duration: 60 minutes.",
            "status": "info",
            "link": "/student/dashboard?sub=exams",
            "is_read": False,
            "hours_ago": 2
        },
        {
            "user_id": user_map.get("priya.patel@student.edu"),
            "type": "result_published",
            "title": "Results Published: NLP Sessional Assessment",
            "message": "Your score for 'NLP Sessional Assessment' is available. You scored 17.00 / 25.00 (68%).",
            "status": "info",
            "link": f"/student/exams/{nlp_exam_id}/result",
            "is_read": True,
            "hours_ago": 12
        },
        {
            "user_id": user_map.get("marcus.vance@student.edu"),
            "type": "result_published",
            "title": "Results Published: NLP Sessional Assessment",
            "message": "Your score for 'NLP Sessional Assessment' is available: 2.00 / 25.00 (Includes proctoring penalty deduction).",
            "status": "warning",
            "link": f"/student/exams/{nlp_exam_id}/result",
            "is_read": False,
            "hours_ago": 12
        }
    ]

    for n in notifications_data:
        if not n["user_id"]:
            continue
        db.execute(
            text("""
                INSERT INTO notifications (id, user_id, type, title, message, status, link, is_read, created_at)
                VALUES (:id, :uid, :type, :title, :msg, :status, :link, :is_read, :cat)
            """),
            {
                "id": uuid.uuid4(),
                "uid": n["user_id"],
                "type": n["type"],
                "title": n["title"],
                "msg": n["message"],
                "status": n["status"],
                "link": n["link"],
                "is_read": n["is_read"],
                "cat": now - timedelta(hours=n["hours_ago"])
            }
        )

    db.commit()
    print(f"  * Seeded {len(notifications_data)} realistic alerts for teachers and students.")

    # -------------------------------------------------------------
    # 7. GLOBAL SETTINGS (MONGODB)
    # -------------------------------------------------------------
    print("\n[7/7] Seeding Global Anti-Cheat Settings (Admin Portal)...")
    mongo.app_settings.update_one(
        {"_id": "global"},
        {
            "$set": {
                "require_fullscreen": True,
                "detect_tab_switch": True,
                "prevent_right_click": True,
                "prevent_copy_paste": True,
                "block_shortcuts": True,
                "disable_text_selection": True,
                "updated_at": now.isoformat()
            }
        },
        upsert=True
    )
    print("  * Global anti-cheat parameters initialized in MongoDB app_settings.")

    print("\n" + "=" * 60)
    print("SEEDING COMPLETED SUCCESSFULLY!")
    print("=" * 60)
    print(f"Presentation Demo Password for all accounts: {DEMO_PASSWORD}")
    print("\nDemo Accounts:")
    print("  * Admin:   admin@autotest.pro")
    print("  * Teacher: tech1@mail.com  OR  prof.turing@autotest.pro")
    print("  * Student (High Score):   alex.chen@student.edu")
    print("  * Student (Average):      priya.patel@student.edu")
    print("  * Student (Cheating Log): marcus.vance@student.edu")
    print("  * Student (Unpublished):  sarah.jenkins@student.edu")
    print("  * Student (In-Progress):  jordan.lee@student.edu")
    print("=" * 60)

    db.close()

if __name__ == "__main__":
    run_seed()
