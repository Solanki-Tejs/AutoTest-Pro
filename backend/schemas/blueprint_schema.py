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
    sections: List[SectionCreate]

class BlueprintResponse(BaseModel):
    exam_id: str
    total_marks: int
    sections: List[SectionResponse]
