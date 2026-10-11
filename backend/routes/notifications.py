from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any

from databases.database import get_db
from routes.dependencies import get_current_user
from services import notification_service

router = APIRouter()

@router.get("")
def list_notifications(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    return notification_service.get_user_notifications(user_id, db)

@router.get("/unread-count")
def get_unread_count(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    data = notification_service.get_user_notifications(user_id, db, limit=1)
    return {"unread_count": data.get("unread_count", 0)}

@router.patch("/{notification_id}/read")
def mark_read(notification_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    success = notification_service.mark_notification_as_read(notification_id, user_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "success"}

@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    count = notification_service.mark_all_notifications_as_read(user_id, db)
    return {"status": "success", "updated": count}
