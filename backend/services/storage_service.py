import os
import shutil
import re
from fastapi import UploadFile
from pathlib import Path
from uuid import uuid4

STORAGE_DIR = Path("storage")

class StorageService:
    @staticmethod
    def _get_class_dir(class_id: str) -> Path:
        class_dir = STORAGE_DIR / str(class_id)
        class_dir.mkdir(parents=True, exist_ok=True)
        return class_dir

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        # Remove any path traversal or invalid characters
        filename = os.path.basename(filename)
        # Keep only alphanumeric, dash, underscore, and dot
        filename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)
        return filename

    @staticmethod
    def save_file(class_id: str, file: UploadFile) -> str:
        class_dir = StorageService._get_class_dir(class_id)
        
        original_name = file.filename or "syllabus"
        sanitized_name = StorageService._sanitize_filename(original_name)
        
        name, ext = os.path.splitext(sanitized_name)
        # Append short uuid to ensure uniqueness and prevent overwriting
        safe_filename = f"{name}-{uuid4().hex[:8]}{ext}"
        
        file_path = class_dir / safe_filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return f"{class_id}/{safe_filename}"

    @staticmethod
    def get_file_path(file_ref: str) -> Path | None:
        # Prevent path traversal in file_ref
        if ".." in file_ref or file_ref.startswith("/"):
            return None
            
        file_path = STORAGE_DIR / file_ref
        if file_path.exists() and file_path.is_file():
            return file_path
        return None

    @staticmethod
    def delete_file(file_ref: str) -> bool:
        # Prevent path traversal
        if ".." in file_ref or file_ref.startswith("/"):
            return False
            
        file_path = STORAGE_DIR / file_ref
        if file_path.exists() and file_path.is_file():
            os.remove(file_path)
            return True
        return False
