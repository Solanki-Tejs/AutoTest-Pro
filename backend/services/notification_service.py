from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

_tables_ensured = False

def ensure_tables(db: Session):
    global _tables_ensured
    if _tables_ensured:
        return
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) NOT NULL DEFAULT 'general',
            link VARCHAR(255) NULL,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    # In case the table was created previously without link column
    db.execute(text("""
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255) NULL;
    """))
    db.commit()
    _tables_ensured = True


def create_notification(
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "general",
    link: Optional[str] = None,
    db: Optional[Session] = None
) -> Optional[dict]:
    if db is None:
        from databases.database import SessionLocal
        temp_db = SessionLocal()
        try:
            return create_notification(user_id, title, message, notification_type, link, temp_db)
        finally:
            temp_db.close()

    ensure_tables(db)
    query = text("""
        INSERT INTO notifications (user_id, title, message, type, link)
        VALUES (:user_id, :title, :message, :type, :link)
        RETURNING id, user_id, title, message, type, link, is_read, created_at
    """)
    result = db.execute(query, {
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "link": link
    })
    row = result.mappings().one()
    db.commit()
    res = dict(row)
    if res.get("id"):
        res["id"] = str(res["id"])
    if res.get("created_at") and hasattr(res["created_at"], "isoformat"):
        res["created_at"] = res["created_at"].isoformat()
    return res


def notify_users(
    user_ids: List[int],
    title: str,
    message: str,
    notification_type: str = "general",
    link: Optional[str] = None,
    db: Optional[Session] = None
):
    for uid in user_ids:
        try:
            create_notification(uid, title, message, notification_type, link, db)
        except Exception as e:
            print(f"[NOTIFICATION ERROR] Failed to notify user {uid}: {e}")


def get_user_notifications(user_id: int, db: Session, limit: int = 50) -> Dict[str, Any]:
    ensure_tables(db)
    query = text("""
        SELECT id, user_id, title, message, type, link, is_read, created_at
        FROM notifications
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit
    """)
    rows = db.execute(query, {"user_id": user_id, "limit": limit}).mappings().all()
    notifications = []
    for r in rows:
        item = dict(r)
        if item.get("id"):
            item["id"] = str(item["id"])
        if item.get("created_at") and hasattr(item["created_at"], "isoformat"):
            item["created_at"] = item["created_at"].isoformat()
        notifications.append(item)

    count_query = text("""
        SELECT COUNT(*) FROM notifications
        WHERE user_id = :user_id AND is_read = FALSE
    """)
    unread_count = db.execute(count_query, {"user_id": user_id}).scalar() or 0

    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


def mark_notification_as_read(notification_id: str, user_id: int, db: Session) -> bool:
    ensure_tables(db)
    query = text("""
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = CAST(:id AS uuid) AND user_id = :user_id
        RETURNING id
    """)
    res = db.execute(query, {"id": notification_id, "user_id": user_id}).first()
    db.commit()
    return bool(res)


def mark_all_notifications_as_read(user_id: int, db: Session) -> int:
    ensure_tables(db)
    query = text("""
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = :user_id AND is_read = FALSE
    """)
    res = db.execute(query, {"user_id": user_id})
    db.commit()
    return res.rowcount
