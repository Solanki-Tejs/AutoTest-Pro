from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any

from routes.dependencies import require_roles, get_current_user
from databases.mongo import get_mongo_db

router = APIRouter()

class UpdateSettingsRequest(BaseModel):
    require_fullscreen: bool = True
    detect_tab_switch: bool = True
    prevent_right_click: bool = True
    prevent_copy_paste: bool = True
    block_shortcuts: bool = True
    disable_text_selection: bool = True

@router.get("")
def get_global_settings(current_user: dict = Depends(get_current_user)):
    mongo_db = get_mongo_db()
    settings = mongo_db.app_settings.find_one({"_id": "global"})
    if not settings:
        return {
            "require_fullscreen": True,
            "detect_tab_switch": True,
            "prevent_right_click": True,
            "prevent_copy_paste": True,
            "block_shortcuts": True,
            "disable_text_selection": True
        } # Default
    
    settings.pop("_id", None)
    return settings

@router.put("")
def update_global_settings(payload: UpdateSettingsRequest, current_user: dict = Depends(require_roles("admin"))):
    mongo_db = get_mongo_db()
    mongo_db.app_settings.update_one(
        {"_id": "global"},
        {"$set": payload.dict()},
        upsert=True
    )
    return {"status": "success", "settings": payload.dict()}
