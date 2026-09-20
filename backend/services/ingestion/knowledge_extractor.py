import json
import re
import logging
from typing import Dict, Any, List
import httpx
from core.config import settings

logger = logging.getLogger("ingestion.knowledge")

EXTRACTION_SYSTEM_PROMPT = """You are a knowledge-engineering system for academic curricula.
Your task is to analyze course material chunks and extract atomic, structured knowledge units.

CRITICAL INSTRUCTIONS:
1. STRICTLY DO NOT generate exam questions, quiz questions, MCQs, or practice exercises.
2. Only extract structured knowledge that represents facts, concepts, definitions, procedures, formulas, or comparisons in the text.
3. Output MUST be valid JSON: a JSON array of objects.

Schema for each knowledge unit:
[
  {
    "type": "concept" | "definition" | "fact" | "procedure" | "formula" | "comparison" | "diagram_description",
    "name": "Concise title or concept name",
    "summary": "Clear, precise explanation or definition",
    "key_points": ["point 1", "point 2"],
    "related_terms": ["term 1", "term 2"]
  }
]
"""

class KnowledgeExtractor:
    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL, model: str = settings.OLLAMA_LLM_MODEL):
        self.base_url = base_url
        self.model = model

    def extract_from_chunk(self, chunk: Dict[str, Any], syllabus_id: str) -> List[Dict[str, Any]]:
        content = chunk.get("content", "").strip()
        metadata = chunk.get("metadata", {})
        chunk_id = chunk.get("id")

        if not content or len(content) < 30:
            return []

        user_prompt = f"Extract structured knowledge units from the following text (Output ONLY a JSON array):\n\n{content}"

        units = []
        try:
            resp = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "system": EXTRACTION_SYSTEM_PROMPT,
                    "prompt": user_prompt,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "num_predict": 350,
                        "temperature": 0.1,
                        "top_p": 0.9,
                    },
                },
                timeout=120.0,
            )

            if resp.status_code == 200:
                raw_text = resp.json().get("response", "").strip()
                parsed_json = self._clean_and_parse_json(raw_text)
                
                if isinstance(parsed_json, dict):
                    # In case the model wrapped the list in a key like "knowledge_units"
                    for val in parsed_json.values():
                        if isinstance(val, list):
                            parsed_json = val
                            break
                    else:
                        parsed_json = [parsed_json]

                if isinstance(parsed_json, list):
                    for item in parsed_json:
                        if not isinstance(item, dict):
                            continue
                        name = item.get("name") or metadata.get("section") or "Knowledge Unit"
                        k_type = item.get("type", "concept")
                        
                        units.append({
                            "syllabus_id": syllabus_id,
                            "chunk_id": chunk_id,
                            "type": k_type,
                            "name": str(name)[:255],
                            "structured_content": item,
                            "source_provenance": {
                                "pages": metadata.get("pages", []),
                                "section": metadata.get("section"),
                                "subsection": metadata.get("subsection"),
                                "chunk_index": chunk.get("chunk_index"),
                            }
                        })
        except Exception as e:
            logger.warning(f"[INGESTION] Mistral extraction failed on chunk: {e}. Falling back to content summary.")

        # Fallback if no units extracted: create a foundational fact unit from the chunk content
        if not units and content:
            units.append({
                "syllabus_id": syllabus_id,
                "chunk_id": chunk_id,
                "type": "fact",
                "name": metadata.get("section") or "Course Content",
                "structured_content": {
                    "type": "fact",
                    "name": metadata.get("section") or "Course Content",
                    "summary": content[:500],
                    "key_points": [content[:200]],
                },
                "source_provenance": {
                    "pages": metadata.get("pages", []),
                    "section": metadata.get("section"),
                    "subsection": metadata.get("subsection"),
                    "chunk_index": chunk.get("chunk_index"),
                }
            })

        return units

    def _clean_and_parse_json(self, text: str) -> Any:
        text = text.strip()
        # Remove markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Attempt to extract first array [ ... ] or object { ... }
            match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except Exception:
                    pass
        return []
