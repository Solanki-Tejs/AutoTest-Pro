from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class SyllabusResponse(BaseModel):
    id: UUID
    class_id: int
    title: str
    file_ref: str
    created_at: datetime

    class Config:
        from_attributes = True
