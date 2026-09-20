import logging
from typing import List, Optional
import httpx
from core.config import settings

logger = logging.getLogger("ingestion.embedding")

class EmbeddingService:
    def __init__(
        self,
        base_url: str = settings.OLLAMA_BASE_URL,
        model: str = settings.OLLAMA_EMBEDDING_MODEL,
        dim: int = settings.EMBEDDING_DIM,
    ):
        self.base_url = base_url
        self.model = model
        self.dim = dim

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generates a 768-dimensional vector embedding using Ollama nomic-embed-text:latest.
        """
        if not text or not text.strip():
            return None

        clean_text = text.strip().replace("\x00", "")
        # nomic-embed-text max context is ~8192 tokens; truncate text to safe character count if huge
        if len(clean_text) > 8000:
            clean_text = clean_text[:8000]

        try:
            resp = httpx.post(
                f"{self.base_url}/api/embeddings",
                json={
                    "model": self.model,
                    "prompt": clean_text,
                },
                timeout=45.0,
            )
            if resp.status_code == 200:
                emb = resp.json().get("embedding")
                if emb and len(emb) == self.dim:
                    return emb
                elif emb:
                    logger.warning(f"Unexpected embedding dimension: {len(emb)}, expected {self.dim}")
                    return emb[:self.dim] if len(emb) > self.dim else None
            else:
                logger.error(f"[INGESTION] Embedding error HTTP {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"[INGESTION] Failed to generate embedding: {e}")

        return None
