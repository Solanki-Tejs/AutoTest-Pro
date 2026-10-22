import os
import shutil
import sys
from pathlib import Path

# Add backend root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text
from databases.database import engine
from databases.mongo import get_mongo_db

def reset_all_databases():
    print("=" * 60)
    print("AutoTest Pro - Resetting Databases to Clean Slate")
    print("=" * 60)

    # 1. POSTGRES TABLES
    tables = [
        "document_chunks",
        "syllabus",
        "exam_attempts",
        "exams",
        "class_enrollments",
        "classes",
        "notifications",
        "otps",
        "users",
    ]

    print("\n[1/3] Truncating PostgreSQL tables...")
    with engine.begin() as conn:
        for tbl in tables:
            try:
                conn.execute(text(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;"))
                print(f"  [OK] Truncated: {tbl}")
            except Exception as e:
                print(f"  [ERROR] Error truncating {tbl}: {e}")

    # 2. MONGO COLLECTIONS
    print("\n[2/3] Clearing MongoDB collections...")
    mongo = get_mongo_db()
    collections_to_clear = [
        "audit_logs",
        "answer_generation_jobs",
        "syllabus_topic_mapping",
        "question_bank",
        "answer_bank",
        "generation_jobs",
        "proctoring_events",
        "exam_question_blueprint",
        "exam_attempt_answers",
    ]

    for col_name in collections_to_clear:
        try:
            res = mongo[col_name].delete_many({})
            print(f"  [OK] Cleared {col_name} ({res.deleted_count} documents removed)")
        except Exception as e:
            print(f"  [ERROR] Error clearing {col_name}: {e}")

    # Reset default global settings
    try:
        mongo.app_settings.delete_many({})
        mongo.app_settings.insert_one({
            "_id": "global",
            "require_fullscreen": True,
            "detect_tab_switch": True,
            "prevent_right_click": True,
            "prevent_copy_paste": True,
            "block_shortcuts": True,
            "disable_text_selection": True,
        })
        print("  [OK] Reset app_settings to default security configuration")
    except Exception as e:
        print(f"  [ERROR] Error resetting app_settings: {e}")

    # 3. UPLOADS & STORAGE DISK CLEANUP
    print("\n[3/3] Cleaning uploaded files from storage & proctoring...")
    storage_dir = BASE_DIR / "storage"
    uploads_proc_dir = BASE_DIR / "uploads" / "proctoring"

    deleted_storage_files = 0
    if storage_dir.exists():
        for item in storage_dir.iterdir():
            if item.is_file():
                item.unlink()
                deleted_storage_files += 1
            elif item.is_dir():
                shutil.rmtree(item)
                deleted_storage_files += 1
        storage_dir.mkdir(parents=True, exist_ok=True)
    print(f"  [OK] Cleaned storage directory ({deleted_storage_files} items removed)")

    deleted_proc_files = 0
    if uploads_proc_dir.exists():
        for item in uploads_proc_dir.iterdir():
            if item.is_file():
                item.unlink()
                deleted_proc_files += 1
            elif item.is_dir():
                shutil.rmtree(item)
                deleted_proc_files += 1
        uploads_proc_dir.mkdir(parents=True, exist_ok=True)
    print(f"  [OK] Cleaned uploads/proctoring directory ({deleted_proc_files} items removed)")

    print("\n" + "=" * 60)
    print("Database reset complete! The system is now at a fresh state.")
    print("=" * 60)

if __name__ == "__main__":
    reset_all_databases()
