from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    teacher = "teacher"
    student = "student"
    admin = "admin"


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
