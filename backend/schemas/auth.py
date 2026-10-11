from enum import Enum
from typing import Optional
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
    otp: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class SendOtpRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(default="register")  # 'register', 'forgot_password', 'update_password'


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=10)
    purpose: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=4, max_length=10)
    new_password: str = Field(min_length=8, max_length=128)


class UpdatePasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    otp: Optional[str] = None
    old_password: Optional[str] = None
