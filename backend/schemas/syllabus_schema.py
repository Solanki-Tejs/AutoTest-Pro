from pydantic import BaseModel, ConfigDict
from datetime import datetime
from uuid import UUID
from typing import Optional

class SyllabusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    class_id: int
    title: str
    file_ref: str
    created_at: datetime
    status: str = "uploaded"
    processing_stage: Optional[str] = None
    error_message: Optional[str] = None

class SyllabusStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    stage: Optional[str] = None
    progress: int = 0
    error_message: Optional[str] = None
    updated_at: Optional[datetime] = None

