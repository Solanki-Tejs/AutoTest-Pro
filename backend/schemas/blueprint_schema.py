from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import UUID

class SectionCreate(BaseModel):
    section: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    count: int = Field(..., gt=0)
    marks_each: int = Field(..., gt=0)
    order: Optional[int] = 0

class SectionResponse(SectionCreate):
    section_id: str
    total_marks: int

class BlueprintCreate(BaseModel):
    version: Optional[int] = None
    passing_percentage: Optional[float] = Field(default=40.0, ge=1.0, le=100.0)
    sections: List[SectionCreate]

class BlueprintResponse(BaseModel):
    exam_id: str
    total_marks: int
    version: int = 1
    passing_percentage: float = 40.0
    sections: List[SectionResponse]
