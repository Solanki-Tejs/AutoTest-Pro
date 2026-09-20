from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class SyllabusResponse(BaseModel):
    id: UUID
    class_id: int
    title: str
    file_ref: str
    status: str | None = None
    stage: str | None = None
    error: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
