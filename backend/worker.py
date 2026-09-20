"""
AutoTest Pro - Standalone RQ Worker
Processes asynchronous document ingestion jobs from Redis queue.
"""
import sys
import logging
from pathlib import Path
from rq import Worker, Queue, SimpleWorker

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [WORKER] %(message)s"
)
logger = logging.getLogger("worker")

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from core.queue import get_redis_connection, INGESTION_QUEUE_NAME
from bootstrap import bootstrap_system

def run_worker():
    logger.info("Initializing AutoTest Pro Background Worker...")
    # Verify infrastructure readiness first
    bootstrap_system()

    redis_conn = get_redis_connection()
    logger.info(f"Worker connected to Redis. Listening to queue: '{INGESTION_QUEUE_NAME}'")

    # On Windows, os.fork() is not supported; SimpleWorker executes jobs in the current process
    worker_cls = SimpleWorker if sys.platform == "win32" else Worker
    worker = worker_cls(
        [INGESTION_QUEUE_NAME],
        connection=redis_conn,
        name="autotestpro-ingestion-worker",
    )
    worker.work()

if __name__ == "__main__":
    run_worker()
