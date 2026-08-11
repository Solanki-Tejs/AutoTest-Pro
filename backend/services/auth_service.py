# from sqlalchemy import text


# from core.security import hash_password
# from sqlalchemy.orm import Session


# def create_use(data,db: Session):
#     query = text("""
#         INSERT INTO users (
#             name,
#             email,
#             password_hash,
#             role
#         )
#         VALUES (
#             :name,
#             :email,
#             :password_hash,
#             :role
#         )
#         RETURNING
#             id,
#             name,
#             email,
#             role,
#             created_at
#     """)


#     result = db.execute(
#         query,
#         {
#             "name": data.name,
#             "email": data.email.lower(),
#             "password_hash": hash_password(
#                 data.password
#             ),
#             "role": data.role
#         }
#     )

#     user = result.fetchone()
#     db.commit()
#     return 




from sqlalchemy import text
from sqlalchemy.orm import Session

from core.security import hash_password, verify_password


def create_user(data, db: Session):
    query = text("""
        INSERT INTO users (
            name,
            email,
            password_hash,
            role
        )
        VALUES (
            :name,
            :email,
            :password_hash,
            :role
        )
        RETURNING
            id,
            name,
            email,
            role,
            created_at
    """)

    result = db.execute(
        query,
        {
            "name": data.name,
            "email": data.email.lower().strip(),
            "password_hash": hash_password(data.password),
            "role": data.role.value,
        }
    )

    user = result.mappings().one()

    db.commit()

    return dict(user)


def get_user_by_email(email: str, db: Session):
    query = text("""
        SELECT
            id,
            name,
            email,
            password_hash,
            role,
            created_at
        FROM users
        WHERE email = :email
    """)

    result = db.execute(
        query,
        {
            "email": email.lower().strip()
        }
    )

    user = result.mappings().first()

    if user is None:
        return None

    return dict(user)


def authenticate_user(email: str, password: str, db: Session):
    user = get_user_by_email(email, db)

    if not user:
        return None

    if not verify_password(
        password,
        user["password_hash"]
    ):
        return None

    return user

    