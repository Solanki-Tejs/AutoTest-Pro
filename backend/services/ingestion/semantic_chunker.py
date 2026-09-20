import re
import logging
from typing import Dict, Any, List

logger = logging.getLogger("ingestion.chunker")

class SemanticChunk:
    def __init__(
        self,
        chunk_index: int,
        content: str,
        metadata: Dict[str, Any],
    ):
        self.chunk_index = chunk_index
        self.content = content
        self.metadata = metadata

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_index": self.chunk_index,
            "content": self.content,
            "metadata": self.metadata,
        }

class SemanticChunker:
    def __init__(self, max_chunk_chars: int = 1800, min_chunk_chars: int = 250):
        self.max_chunk_chars = max_chunk_chars
        self.min_chunk_chars = min_chunk_chars

    def chunk_elements(self, elements: List[Dict[str, Any]], syllabus_id: str) -> List[Dict[str, Any]]:
        """
        Hierarchical structural chunking that groups elements by section and subsection,
        respecting document boundaries and collecting provenance.
        """
        logger.info(f"[INGESTION] Creating semantic chunks from {len(elements)} structural elements...")
        chunks: List[SemanticChunk] = []
        chunk_idx = 0

        # Group elements by (section, subsection)
        current_section = None
        current_subsection = None
        current_content_parts = []
        current_pages = set()
        current_element_types = []
        current_element_ids = []

        def flush_current_chunk():
            nonlocal chunk_idx, current_content_parts, current_pages, current_element_types, current_element_ids
            if not current_content_parts:
                return

            full_text = "\n\n".join(current_content_parts).strip()
            if not full_text:
                return

            metadata = {
                "syllabus_id": syllabus_id,
                "section": current_section or "General",
                "subsection": current_subsection,
                "pages": sorted(list(current_pages)),
                "element_types": list(set(current_element_types)),
                "element_ids": current_element_ids[:],
            }

            chunks.append(SemanticChunk(
                chunk_index=chunk_idx,
                content=full_text,
                metadata=metadata,
            ))
            chunk_idx += 1

            current_content_parts = []
            current_pages = set()
            current_element_types = []
            current_element_ids = []

        for elem in elements:
            e_type = elem.get("type", "paragraph")
            content = elem.get("content", "").strip()
            page_num = elem.get("page_number", 1)
            elem_meta = elem.get("metadata", {})
            elem_id = str(elem.get("id", ""))

            section = elem_meta.get("section") or current_section or "General"
            subsection = elem_meta.get("subsection") or current_subsection

            if not content:
                continue

            # Heading change indicates structural section boundary
            if e_type == "heading" and current_content_parts:
                flush_current_chunk()
                current_section = section
                current_subsection = subsection

            # Check if adding this element would exceed max chunk characters
            potential_len = sum(len(p) for p in current_content_parts) + len(content)
            if potential_len > self.max_chunk_chars and current_content_parts:
                flush_current_chunk()

            # If a single element exceeds max chunk chars, split on paragraph or sentence boundaries
            if len(content) > self.max_chunk_chars:
                paragraphs = re.split(r'\n{2,}', content)
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    if len(para) > self.max_chunk_chars:
                        sentences = re.split(r'(?<=[.!?])\s+', para)
                        sent_buffer = []
                        for sent in sentences:
                            if sum(len(s) for s in sent_buffer) + len(sent) > self.max_chunk_chars:
                                current_content_parts.append(" ".join(sent_buffer))
                                current_pages.add(page_num)
                                current_element_types.append(e_type)
                                if elem_id:
                                    current_element_ids.append(elem_id)
                                flush_current_chunk()
                                sent_buffer = []
                            sent_buffer.append(sent)
                        if sent_buffer:
                            current_content_parts.append(" ".join(sent_buffer))
                    else:
                        current_content_parts.append(para)
                        current_pages.add(page_num)
                        current_element_types.append(e_type)
                        if elem_id:
                            current_element_ids.append(elem_id)
            else:
                current_content_parts.append(content)
                current_pages.add(page_num)
                current_element_types.append(e_type)
                if elem_id:
                    current_element_ids.append(elem_id)

            current_section = section
            current_subsection = subsection

        flush_current_chunk()
        logger.info(f"[INGESTION] Created {len(chunks)} semantic chunks with provenance.")
        return [c.to_dict() for c in chunks]
