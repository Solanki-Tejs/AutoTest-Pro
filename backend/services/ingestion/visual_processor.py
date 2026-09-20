import base64
import logging
from pathlib import Path
from typing import Dict, Any, List
import httpx
from core.config import settings

logger = logging.getLogger("ingestion.visual")

class VisualProcessor:
    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL, model: str = settings.OLLAMA_VISION_MODEL):
        self.base_url = base_url
        self.model = model

    def process_visual_elements(self, elements: List[Dict[str, Any]], storage_dir: Path) -> List[Dict[str, Any]]:
        """
        Processes visual elements (images, diagrams, charts) through LLaVA 7B.
        Strictly skips text elements and pages that do not contain visual elements.
        """
        raw_image_elements = [e for e in elements if e.get("type") in ("image", "diagram")]
        
        # 1. Filter out icons, bullets, and structural template artifacts
        # Real diagrams/figures must have substantive dimensions (>= 180x140 and area >= 28000)
        valid_candidates = []
        for elem in raw_image_elements:
            metadata = elem.get("metadata", {})
            w = metadata.get("width", 0)
            h = metadata.get("height", 0)
            if w > 0 and h > 0 and (w < 180 or h < 140 or (w * h) < 28000):
                elem["visual_description"] = "Icon or structural decorative element (skipped deep visual inspection)."
                continue
            valid_candidates.append(elem)

        # 2. Cap deep vision model analysis to top 6 most significant figures per syllabus
        # to ensure high ingestion throughput and prevent multi-hour queue blocking
        MAX_VISUAL_ANALYSIS = 6
        if len(valid_candidates) > MAX_VISUAL_ANALYSIS:
            logger.info(
                f"[INGESTION] Capping deep visual inspection from {len(valid_candidates)} to top "
                f"{MAX_VISUAL_ANALYSIS} figures by area to optimize throughput."
            )
            valid_candidates.sort(
                key=lambda x: x.get("metadata", {}).get("width", 0) * x.get("metadata", {}).get("height", 0),
                reverse=True,
            )
            selected = valid_candidates[:MAX_VISUAL_ANALYSIS]
            for unselected in valid_candidates[MAX_VISUAL_ANALYSIS:]:
                unselected["visual_description"] = "Visual figure noted (omitted from deep vision model to optimize throughput)."
            image_elements = selected
        else:
            image_elements = valid_candidates

        logger.info(f"[INGESTION] Processing {len(image_elements)} primary visual elements using {self.model}...")

        if not image_elements:
            return elements

        # Cache descriptions by image path to avoid redundant vision inferences
        cached_descriptions: Dict[str, str] = {}

        for elem in image_elements:
            metadata = elem.get("metadata", {})
            img_path_str = metadata.get("image_path")
            
            # If image_path not in metadata, try resolving from image_ref
            if not img_path_str and elem.get("image_ref"):
                candidate = storage_dir / elem["image_ref"]
                if candidate.exists():
                    img_path_str = str(candidate)

            if not img_path_str or not Path(img_path_str).exists():
                elem["visual_description"] = "Visual element detected (image file reference not available)."
                continue

            # Check if this exact image was already analyzed
            if img_path_str in cached_descriptions:
                cached_desc = cached_descriptions[img_path_str]
                elem["visual_description"] = cached_desc
                elem["content"] = f"{elem.get('content', '')}\n[Visual Description: {cached_desc}]".strip()
                continue

            try:
                with open(img_path_str, "rb") as img_file:
                    img_b64 = base64.b64encode(img_file.read()).decode("utf-8")

                logger.info(f"[INGESTION] Invoking {self.model} for image on page {elem.get('page_number')}...")
                
                prompt = (
                    "Analyze this educational diagram, chart, or figure from a syllabus/course material. "
                    "Provide a clear, structured summary describing: "
                    "1) The primary concept, structure, or system shown. "
                    "2) Key labels, stages, or components. "
                    "3) Relationships or data trends depicted."
                )

                resp = httpx.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "images": [img_b64],
                        "stream": False,
                    },
                    timeout=60.0,
                )

                if resp.status_code == 200:
                    description = resp.json().get("response", "").strip()
                    elem["visual_description"] = description
                    # Combine visual description into content for downstream chunking
                    elem["content"] = f"{elem.get('content', '')}\n[Visual Description: {description}]".strip()
                    logger.info(f"[INGESTION] Generated description for visual element on page {elem.get('page_number')}.")
                else:
                    logger.warning(f"[INGESTION] LLaVA returned HTTP {resp.status_code}: {resp.text}")
                    elem["visual_description"] = "Visual element analyzed (description unavailable from model)."

            except Exception as e:
                logger.error(f"[INGESTION] Visual processing failed for element on page {elem.get('page_number')}: {e}")
                elem["visual_description"] = "Visual element processing encountered an error."

        return elements
