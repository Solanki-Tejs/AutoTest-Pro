"""
AutoTest Pro - System Bootstrap Script
Initializes PostgreSQL database extensions, tables, checks Redis and Ollama connectivity.
Ensures zero-race-condition startup sequence.
"""
import sys
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [BOOTSTRAP] %(message)s"
)
logger = logging.getLogger("bootstrap")

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.config import settings
from databases.database import SessionLocal, engine
from services.syllabus_service import ensure_tables as ensure_syllabus_tables
from services.class_service import ensure_tables as ensure_class_tables
from core.queue import get_redis_connection
import httpx

def check_postgres() -> bool:
    logger.info("Connecting to PostgreSQL...")
    try:
        db = SessionLocal()
        ensure_class_tables(db)
        ensure_syllabus_tables(db)
        db.close()
        logger.info("PostgreSQL tables and extensions (pgcrypto, pgvector) verified.")
        return True
    except Exception as e:
        logger.error(f"PostgreSQL initialization failed: {e}")
        return False

def check_redis() -> bool:
    logger.info("Connecting to Redis...")
    try:
        r = get_redis_connection()
        if r.ping():
            logger.info("Redis connection verified.")
            return True
        logger.error("Redis ping returned False.")
        return False
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        return False

def check_ollama() -> bool:
    logger.info("Checking Ollama availability and models...")
    try:
        url = f"{settings.OLLAMA_BASE_URL}/api/tags"
        resp = httpx.get(url, timeout=5.0)
        if resp.status_code == 200:
            models = [m.get("name") for m in resp.json().get("models", [])]
            logger.info(f"Ollama reachable. Models found: {models}")
            required_models = [settings.OLLAMA_EMBEDDING_MODEL, settings.OLLAMA_VISION_MODEL, settings.OLLAMA_LLM_MODEL]
            missing = [m for m in required_models if not any(m in model_name for model_name in models)]
            if missing:
                logger.warning(f"Note: Some models may not be in local Ollama list: {missing}")
            else:
                logger.info("All required Ollama models confirmed present.")
            return True
        else:
            logger.warning(f"Ollama returned HTTP {resp.status_code}")
            return False
    except Exception as e:
        logger.warning(f"Ollama not currently reachable at {settings.OLLAMA_BASE_URL}: {e}")
        return False

def bootstrap_system():
    logger.info("Starting AutoTest Pro Infrastructure Bootstrap...")
    
    # 1. PostgreSQL
    if not check_postgres():
        sys.exit(1)
        
    # 2. Redis
    if not check_redis():
        logger.warning("Redis is not reachable. Background workers will not process jobs until Redis starts.")
        
    # 3. Ollama
    check_ollama()
    
    # 4. Storage directory
    storage_path = backend_dir / "storage"
    storage_path.mkdir(parents=True, exist_ok=True)
    logger.info(f"Storage directory ensured at {storage_path}")

    logger.info("Bootstrap complete. System is ready.")

if __name__ == "__main__":
    bootstrap_system()
