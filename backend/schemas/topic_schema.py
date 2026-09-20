from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import UUID

class Subtopic(BaseModel):
    subtopic_name: str
    chunk_ids: List[str]

class Topic(BaseModel):
    topic_name: str
    chunk_ids: List[str]
    subtopics: List[Subtopic]

class SyllabusTopicMappingBase(BaseModel):
    uploaded_syllabus_id: UUID
    topics: List[Topic]

class SyllabusTopicMappingCreate(SyllabusTopicMappingBase):
    pass

class SyllabusTopicMappingResponse(SyllabusTopicMappingBase):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
