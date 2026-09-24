from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from uuid import UUID

class AnswerSchema(BaseModel):
    answer_id: str
    question_id: str
    answer_key: Optional[str] = None
    answer_text: str
    answer_type: str
    is_edited: bool = False
    is_approved: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class AnswerBankResponse(BaseModel):
    id: str = Field(alias="_id", default="")
    exam_id: str
    question_bank_id: str
    question_bank_version: int
    answer_body: List[AnswerSchema] = []
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

class AnswerUpdateSchema(BaseModel):
    answer_key: Optional[str] = None
    answer_text: Optional[str] = None

class AnswerRegenerateRequest(BaseModel):
    mode: str = "unedited"

class AnswerGenerationStatus(BaseModel):
    exam_id: str
    status: str
    total_questions: int = 0
    generated_questions: int = 0
    failed_questions: int = 0
    progress: int = 0
