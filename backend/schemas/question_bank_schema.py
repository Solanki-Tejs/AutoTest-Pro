from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class OptionSchema(BaseModel):
    id: str
    text: str

class QuestionSchema(BaseModel):
    question_id: str
    question_text: str
    type: str
    options: Optional[List[OptionSchema]] = None
    correct_answer: Optional[str] = None
    bloom_level: str
    mark: int
    order: int
    source_chunk_ids: Optional[List[str]] = []
    is_edited: bool = False
    is_regenerated: bool = False

class SectionSchema(BaseModel):
    sectionNo: str
    sectionName: str
    questions: List[QuestionSchema] = []

class QuestionBodySchema(BaseModel):
    sections: List[SectionSchema] = []

class GenerationMetadataSchema(BaseModel):
    method: str
    model: str
    generated_at: Optional[datetime] = None
    blueprint_version: int = 1
    syllabus_ids: List[str] = []

class QuestionBankResponse(BaseModel):
    id: str = Field(alias="_id", default="")
    exam_id: str
    version: int
    status: str
    is_active: bool
    question_body: QuestionBodySchema
    generation: Optional[GenerationMetadataSchema] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

class QuestionUpdateSchema(BaseModel):
    question_text: Optional[str] = None
    bloom_level: Optional[str] = None
    mark: Optional[int] = None
    options: Optional[List[OptionSchema]] = None
    correct_answer: Optional[str] = None

class PaperGenerationStatus(BaseModel):
    exam_id: str
    status: str
    progress: Optional[int] = None
    current_section: Optional[str] = None

class QuestionSpecification(BaseModel):
    section: str
    type: str
    marks: int
    bloom_level: str
    difficulty: str
    topic: Optional[str] = None
    subtopic: Optional[str] = None
    concept: Optional[str] = None
