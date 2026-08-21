from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# ─── Class Schemas ────────────────────────────────────────────────────────────

class ClassCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ClassResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    teacher_id: int
    teacher_name: str
    student_count: int
    created_at: datetime


# ─── Join Request Schemas ─────────────────────────────────────────────────────

class JoinRequestCreate(BaseModel):
    class_id: int


class JoinRequestResponse(BaseModel):
    id: int
    class_id: int
    class_name: str
    student_id: int
    student_name: str
    student_email: str
    status: str  # "pending" | "approved" | "rejected"
    created_at: datetime


class MembershipResponse(BaseModel):
    id: int
    class_id: int
    class_name: str
    class_description: Optional[str]
    teacher_name: str
    status: str
    joined_at: Optional[datetime]
