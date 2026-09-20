import os
import uuid
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import pymupdf  # PyMuPDF
from docling.document_converter import DocumentConverter
from docling_core.types.doc.document import (
    DoclingDocument,
    SectionHeaderItem,
    TextItem,
    ListItem,
    TableItem,
    PictureItem,
)

logger = logging.getLogger("ingestion.parser")

class ParsedElement:
    def __init__(
        self,
        element_type: str,
        content: str,
        page_number: int,
        metadata: Optional[Dict[str, Any]] = None,
        image_ref: Optional[str] = None,
    ):
        self.element_type = element_type
        self.content = content
        self.page_number = page_number
        self.metadata = metadata or {}
        self.image_ref = image_ref

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.element_type,
            "content": self.content,
            "page_number": self.page_number,
            "metadata": self.metadata,
            "image_ref": self.image_ref,
        }

class PDFParser:
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.images_dir = output_dir / "images"
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.converter = DocumentConverter()

    def parse(self, pdf_path: Path, class_id: str, syllabus_id: str) -> Dict[str, Any]:
        """
        Parses a PDF using Docling for semantic structural extraction
        and PyMuPDF for page inspection, image extraction, and metadata.
        """
        logger.info(f"[INGESTION] Parsing PDF: {pdf_path}")
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        # 1. PyMuPDF inspection & image extraction
        doc_fitz = pymupdf.open(str(pdf_path))
        num_pages = len(doc_fitz)
        logger.info(f"[INGESTION] Total pages: {num_pages}")

        # Check for scanned/image-only PDF
        total_text_length = 0
        page_image_map: Dict[int, List[Dict[str, Any]]] = {}
        seen_image_hashes = set()

        for page_idx in range(num_pages):
            page = doc_fitz[page_idx]
            page_num = page_idx + 1
            text = page.get_text()
            total_text_length += len(text.strip())

            # Extract embedded images on this page
            image_list = page.get_images(full=True)
            page_images = []
            for img_idx, img in enumerate(image_list):
                xref = img[0]
                base_image = doc_fitz.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                width = base_image["width"]
                height = base_image["height"]

                # Filter out small icons, bullet points, headers/footers, and structural decorations
                # Real educational figures/diagrams have substantive dimensions (>= 180x140 and area >= 28,000)
                if width < 180 or height < 140 or (width * height) < 28000:
                    continue

                # Deduplicate identical template images (e.g. repeated logos/template banners across slides)
                img_hash = hashlib.md5(image_bytes).hexdigest()
                if img_hash in seen_image_hashes:
                    continue
                seen_image_hashes.add(img_hash)

                img_filename = f"{syllabus_id}_p{page_num}_img{img_idx}_{uuid.uuid4().hex[:6]}.{image_ext}"
                img_path = self.images_dir / img_filename
                with open(img_path, "wb") as f:
                    f.write(image_bytes)

                rel_ref = f"{class_id}/images/{img_filename}"
                page_images.append({
                    "image_ref": rel_ref,
                    "image_path": str(img_path),
                    "width": width,
                    "height": height,
                    "ext": image_ext,
                    "page_number": page_num,
                })
            page_image_map[page_num] = page_images

        is_scanned = total_text_length < (10 * num_pages)
        if is_scanned:
            logger.info("[INGESTION] Scanned/low-text PDF detected. Relying on Docling OCR pipeline.")

        doc_fitz.close()

        # 2. Docling Conversion
        conv_res = self.converter.convert(str(pdf_path))
        docling_doc: DoclingDocument = conv_res.document

        elements: List[ParsedElement] = []
        current_section = "General"
        current_subsection = None

        for item, level in docling_doc.iterate_items():
            # Determine page number
            page_num = 1
            if hasattr(item, "prov") and item.prov and len(item.prov) > 0:
                page_num = getattr(item.prov[0], "page_no", 1)

            if isinstance(item, SectionHeaderItem):
                header_text = getattr(item, "text", "").strip()
                if header_text:
                    if level <= 1:
                        current_section = header_text
                        current_subsection = None
                    else:
                        current_subsection = header_text

                    elements.append(
                        ParsedElement(
                            element_type="heading",
                            content=header_text,
                            page_number=page_num,
                            metadata={
                                "level": level,
                                "section": current_section,
                                "subsection": current_subsection,
                            }
                        )
                    )

            elif isinstance(item, TableItem):
                # Structured Table Handling
                table_md = ""
                table_data: Dict[str, Any] = {}
                try:
                    df = item.export_to_dataframe()
                    headers = [str(c) for c in df.columns.tolist()]
                    rows = [[str(cell) for cell in row] for row in df.values.tolist()]
                    table_data = {"headers": headers, "rows": rows}
                    table_md = item.export_to_markdown()
                except Exception as ex:
                    logger.warning(f"Error exporting table to dataframe: {ex}")
                    table_md = getattr(item, "text", "")

                elements.append(
                    ParsedElement(
                        element_type="table",
                        content=table_md or getattr(item, "text", ""),
                        page_number=page_num,
                        metadata={
                            "section": current_section,
                            "subsection": current_subsection,
                            "table_data": table_data,
                            "is_table": True,
                        }
                    )
                )

            elif isinstance(item, ListItem):
                list_text = getattr(item, "text", "").strip()
                if list_text:
                    elements.append(
                        ParsedElement(
                            element_type="list",
                            content=list_text,
                            page_number=page_num,
                            metadata={
                                "section": current_section,
                                "subsection": current_subsection,
                            }
                        )
                    )

            elif isinstance(item, PictureItem):
                # Visual element identified by Docling
                # Associate with extracted PyMuPDF image for this page if available
                img_ref = None
                img_metadata = {}
                if page_num in page_image_map and len(page_image_map[page_num]) > 0:
                    matched_img = page_image_map[page_num].pop(0)
                    img_ref = matched_img["image_ref"]
                    img_metadata = {
                        "width": matched_img["width"],
                        "height": matched_img["height"],
                        "ext": matched_img["ext"],
                        "image_path": matched_img["image_path"],
                    }

                caption = getattr(item, "caption", "") or getattr(item, "text", "") or "Diagram / Figure"
                elements.append(
                    ParsedElement(
                        element_type="image",
                        content=caption,
                        page_number=page_num,
                        metadata={
                            "section": current_section,
                            "subsection": current_subsection,
                            **img_metadata,
                        },
                        image_ref=img_ref,
                    )
                )

            elif isinstance(item, TextItem):
                body_text = getattr(item, "text", "").strip()
                if body_text:
                    elements.append(
                        ParsedElement(
                            element_type="paragraph",
                            content=body_text,
                            page_number=page_num,
                            metadata={
                                "section": current_section,
                                "subsection": current_subsection,
                            }
                        )
                    )

        # Include remaining extracted PyMuPDF images that were not explicitly paired with a PictureItem
        # Only include if they are genuine diagrams (width >= 200, height >= 150) and limit to top 2 per page
        for p_num, remaining_imgs in page_image_map.items():
            valid_remaining = [
                img for img in remaining_imgs 
                if img["width"] >= 200 and img["height"] >= 150
            ][:2]
            for r_img in valid_remaining:
                elements.append(
                    ParsedElement(
                        element_type="image",
                        content=f"Figure extracted from page {p_num}",
                        page_number=p_num,
                        metadata={
                            "section": current_section,
                            "width": r_img["width"],
                            "height": r_img["height"],
                            "ext": r_img["ext"],
                            "image_path": r_img["image_path"],
                        },
                        image_ref=r_img["image_ref"],
                    )
                )

        logger.info(f"[INGESTION] Extracted {len(elements)} structural elements across {num_pages} pages.")

        return {
            "num_pages": num_pages,
            "is_scanned": is_scanned,
            "elements": [e.to_dict() for e in elements],
        }
