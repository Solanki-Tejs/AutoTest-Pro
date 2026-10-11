import random
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
from services.email_service import send_otp_email

_tables_ensured = False

def ensure_tables(db: Session):
    global _tables_ensured
    if _tables_ensured:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS otps (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            otp VARCHAR(10) NOT NULL,
            purpose VARCHAR(50) NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    db.commit()
    _tables_ensured = True


def normalize_purpose(p: str) -> str:
    cleaned = str(p).strip().lower()
    if cleaned in ("register", "registration"):
        return "register"
    return cleaned


def generate_and_send_otp(email: str, purpose: str, db: Session) -> dict:
    ensure_tables(db)
    clean_email = email.strip().lower()
    norm_purpose = normalize_purpose(purpose)

    # Generate 6-digit cryptographic-style numeric OTP
    otp = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    # Invalidate previous unused OTPs for same email & purpose
    db.execute(
        text("""
            UPDATE otps
            SET is_used = TRUE
            WHERE email = :email 
              AND (purpose = :purpose OR (purpose = 'registration' AND :purpose = 'register')) 
              AND is_used = FALSE
        """),
        {"email": clean_email, "purpose": norm_purpose}
    )

    # Insert new OTP
    db.execute(
        text("""
            INSERT INTO otps (email, otp, purpose, expires_at)
            VALUES (:email, :otp, :purpose, :expires_at)
        """),
        {
            "email": clean_email,
            "otp": otp,
            "purpose": norm_purpose,
            "expires_at": expires_at
        }
    )
    db.commit()

    # Dispatch email
    send_otp_email(clean_email, otp, norm_purpose)

    return {
        "status": "success",
        "email": clean_email,
        "purpose": norm_purpose,
        "expires_in_seconds": 600
    }


def verify_otp(email: str, otp: str, purpose: str, db: Session, consume: bool = False) -> bool:
    ensure_tables(db)
    clean_email = email.strip().lower()
    clean_otp = str(otp).strip()
    norm_purpose = normalize_purpose(purpose)

    now = datetime.now(timezone.utc)
    query = text("""
        SELECT id, otp, expires_at, is_used
        FROM otps
        WHERE email = :email 
          AND (purpose = :purpose OR (purpose = 'registration' AND :purpose = 'register') OR (purpose = 'register' AND :purpose = 'registration')) 
          AND otp = :otp 
          AND is_used = FALSE
        ORDER BY created_at DESC
        LIMIT 1
    """)
    row = db.execute(query, {
        "email": clean_email,
        "purpose": norm_purpose,
        "otp": clean_otp
    }).mappings().first()

    if not row:
        return False

    exp = row["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if now > exp:
        return False

    if consume:
        db.execute(
            text("UPDATE otps SET is_used = TRUE WHERE id = :id"),
            {"id": row["id"]}
        )
        db.commit()

    return True
