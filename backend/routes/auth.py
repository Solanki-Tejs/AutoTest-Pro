# from fastapi import APIRouter, Depends, HTTPException, status
# from fastapi.security import OAuth2PasswordRequestForm

# from .dependencies import get_current_user, require_roles
# from core.security import create_access_token, hash_password, verify_password
# from schemas.auth import LoginResponse, RegisterRequest, UserResponse
# from services.auth_service import create_use
# from databases.database import get_db
# from sqlalchemy.orm import Session
# router = APIRouter()


# FAKE_USERS_DB = {}


# @router.post(
#     "/register",
#     response_model=UserResponse,
#     status_code=status.HTTP_201_CREATED,
# )
# async def register(data: RegisterRequest,db: Session = Depends(get_db)):

#     create_use(data,db)
#     return {
#         "id": user["id"],
#         "name": user["name"],
#         "email": user["email"],
#         "role": user["role"],
#     }


# @router.post("/login", response_model=LoginResponse)
# async def login(form_data: OAuth2PasswordRequestForm = Depends()):
#     email = form_data.username.lower().strip()
#     user = FAKE_USERS_DB.get(email)

#     if not user or not verify_password(
#         form_data.password,
#         user["password_hash"],
#     ):
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Invalid email or password",
#             headers={"WWW-Authenticate": "Bearer"},
#         )

#     access_token = create_access_token(
#         {
#             "sub": str(user["id"]),
#             "email": user["email"],
#             "role": user["role"],
#             "name": user["name"],
#         }
#     )

#     return {
#         "access_token": access_token,
#         "token_type": "bearer",
#         "user": {
#             "id": user["id"],
#             "name": user["name"],
#             "email": user["email"],
#             "role": user["role"],
#         },
#     }


# @router.get("/me", response_model=UserResponse)
# async def get_me(current_user=Depends(get_current_user)):
#     return {
#         "id": int(current_user["sub"]),
#         "name": current_user.get("name", ""),
#         "email": current_user["email"],
#         "role": current_user["role"],
#     }


# @router.get("/teacher-only")
# async def teacher_only(
#     current_user=Depends(require_roles("teacher")),
# ):
#     return {
#         "message": "Teacher access granted",
#         "user": current_user,
#     }


# @router.get("/student-only")
# async def student_only(
#     current_user=Depends(require_roles("student")),
# ):
#     return {
#         "message": "Student access granted",
#         "user": current_user,
#     }


# @router.get("/admin")
# async def teacher_or_admin(
#     current_user=Depends(require_roles("admin")),
# ):
#     return {
#         "message": "Admin access granted",
#         "user": current_user,
#     }



from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .dependencies import get_current_user, require_roles

from core.security import create_access_token

from schemas.auth import (
    LoginResponse,
    RegisterRequest,
    UserResponse,
    SendOtpRequest,
    VerifyOtpRequest,
    ForgotPasswordRequest,
    UpdatePasswordRequest,
)

from services.auth_service import (
    create_user,
    authenticate_user,
    get_user_by_email,
    update_password_by_email,
    update_password_by_id,
)
from services.otp_service import generate_and_send_otp, verify_otp
from core.security import verify_password

from databases.database import get_db


router = APIRouter()

@router.post("/send-otp")
async def send_otp(
    data: SendOtpRequest,
    db: Session = Depends(get_db),
):
    email = data.email.lower().strip()
    existing_user = get_user_by_email(email, db)

    norm_purpose = "register" if data.purpose in ("register", "registration") else data.purpose
    if norm_purpose == "register" and existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered. Please log in instead.",
        )

    if data.purpose in ("forgot_password", "update_password") and not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email address.",
        )

    result = generate_and_send_otp(email, data.purpose, db)
    return {"message": "Verification code sent to your email address.", "email": email}


@router.post("/verify-otp")
async def verify_otp_endpoint(
    data: VerifyOtpRequest,
    db: Session = Depends(get_db),
):
    is_valid = verify_otp(data.email, data.otp, data.purpose, db, consume=False)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        )
    return {"valid": True, "message": "Verification code is valid."}


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    # Enforce OTP verification if provided or check if required
    if data.otp:
        is_valid = verify_otp(data.email, data.otp, "register", db, consume=True)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification code. Please request a new code.",
            )

    try:
        user = create_user(data, db)

        return {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        }

    except Exception as e:
        db.rollback()

        # PostgreSQL unique email error
        if "duplicate key" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user",
        )


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    email = data.email.lower().strip()
    is_valid = verify_otp(email, data.otp, "forgot_password", db, consume=True)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code.",
        )

    success = update_password_by_email(email, data.new_password, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return {"message": "Password updated successfully. You can now log in with your new password."}


@router.post("/update-password")
async def update_password(
    data: UpdatePasswordRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = int(current_user["sub"])
    email = current_user["email"]

    if data.otp:
        is_valid = verify_otp(email, data.otp, "update_password", db, consume=True)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification code.",
            )
    elif data.old_password:
        user = get_user_by_email(email, db)
        if not user or not verify_password(data.old_password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either a verification code or current password is required to change password.",
        )

    success = update_password_by_id(user_id, data.new_password, db)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password",
        )

    return {"message": "Password updated successfully."}


@router.post(
    "/login",
    response_model=LoginResponse,
)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    email = form_data.username.lower().strip()

    user = authenticate_user(
        email,
        form_data.password,
        db,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    access_token = create_access_token(
        {
            "sub": str(user["id"]),
            "email": user["email"],
            "role": user["role"],
            "name": user["name"],
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        },
    }

@router.get(
    "/me",
    response_model=UserResponse,
)
async def get_me(
    current_user=Depends(get_current_user),
):
    return {
        "id": current_user["sub"],
        "name": current_user.get("name", ""),
        "email": current_user["email"],
        "role": current_user["role"],
    }



@router.get("/teacher-only")
async def teacher_only(
    current_user=Depends(
        require_roles("teacher")
    ),
):
    return {
        "message": "Teacher access granted",
        "user": current_user,
    }

@router.get("/student-only")
async def student_only(
    current_user=Depends(
        require_roles("student")
    ),
):
    return {
        "message": "Student access granted",
        "user": current_user,
    }


@router.get("/admin")
async def admin_only(
    current_user=Depends(
        require_roles("admin")
    ),
):
    return {
        "message": "Admin access granted",
        "user": current_user,
    }




