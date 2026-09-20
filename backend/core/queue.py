import redis
from rq import Queue
from core.config import settings

INGESTION_QUEUE_NAME = "document_ingestion_queue"

def get_redis_connection() -> redis.Redis:
    """Return a Redis client connection using settings.REDIS_URL."""
    return redis.from_url(settings.REDIS_URL)

def get_ingestion_queue() -> Queue:
    """Return the RQ Queue for document ingestion jobs."""
    redis_conn = get_redis_connection()
    return Queue(INGESTION_QUEUE_NAME, connection=redis_conn)
