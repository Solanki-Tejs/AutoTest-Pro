from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID

class ExamCreate(BaseModel):
    class_id: int
    title: str = Field(..., min_length=1)
    total_marks: int = Field(..., gt=0, le=500)
    duration_minutes: int = Field(..., gt=0, le=300)
    difficulty: str
    selected_pdf_ids: List[UUID] = []
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

class ExamUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    class_id: Optional[int] = None
    total_marks: Optional[int] = Field(None, gt=0, le=500)
    duration_minutes: Optional[int] = Field(None, gt=0, le=300)
    difficulty: Optional[str] = None
    selected_pdf_ids: Optional[List[UUID]] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None

class ExamPublishRequest(BaseModel):
    start_time: datetime
    end_time: datetime


class ExamResponse(BaseModel):
    id: UUID
    class_id: int
    title: str
    total_marks: int
    duration_minutes: int
    difficulty: str
    selected_pdf_ids: List[UUID]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    status: str
    created_at: datetime
