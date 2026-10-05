import cv2
import numpy as np
from fastapi import UploadFile
from sqlalchemy.orm import Session
from datetime import datetime, timezone
import uuid
import os
import mediapipe as mp

from databases.mongo import get_mongo_db

from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# Initialize MediaPipe Face Landmarker
base_options = python.BaseOptions(model_asset_path='models/face_landmarker.task')
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    num_faces=10
)
face_landmarker = vision.FaceLandmarker.create_from_options(options)

UPLOAD_DIR = "uploads/proctoring"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Temporary memory to store consecutive missing face counts
# Keys are attempt_id, values are continuous failure counts
missing_face_counters = {}
FACE_MISSING_THRESHOLD = 3 # e.g. 3 consecutive frames of missing face

def analyze_proctoring_frame(student_id: int, exam_id: str, attempt_id: str, file: UploadFile, db: Session) -> dict:
    # Validate image
    contents = file.file.read()
    if not contents:
        raise ValueError("Empty image")

    # Decode image using OpenCV
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Invalid image format")

    # Convert to RGB and Mediapipe Image format
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_img)
    
    # Process with MediaPipe
    results = face_landmarker.detect(mp_image)
    
    face_count = len(results.face_landmarks) if results.face_landmarks else 0
    
    # Analyze and log events
    event_type = None
    description = ""
    duration_seconds = 0
    save_evidence = False
    metadata = {"face_count": face_count}

    global missing_face_counters
    
    if face_count == 0:
        missing_face_counters[attempt_id] = missing_face_counters.get(attempt_id, 0) + 1
        if missing_face_counters[attempt_id] >= FACE_MISSING_THRESHOLD:
            event_type = "FACE_NOT_DETECTED"
            description = "No face detected in the webcam frame for an extended period."
            duration_seconds = missing_face_counters[attempt_id] * 10
            save_evidence = True
            missing_face_counters[attempt_id] = 0 # reset after event
    elif face_count >= 2:
        missing_face_counters[attempt_id] = 0 # reset
        event_type = "MULTIPLE_FACES"
        description = f"Multiple faces ({face_count}) were detected in the webcam frame."
        save_evidence = True
    else:
        # face_count == 1
        missing_face_counters[attempt_id] = 0
        
        # Analyze head pose
        landmarks = results.face_landmarks[0]
        
        # Key landmarks
        nose = landmarks[1]
        left_eye = landmarks[33]     # User's right eye (image left)
        right_eye = landmarks[263]   # User's left eye (image right)
        forehead = landmarks[10]
        chin = landmarks[152]
        
        # Left/Right detection
        dx_left = nose.x - left_eye.x
        dx_right = right_eye.x - nose.x
        
        # Up/Down detection
        dy_up = nose.y - forehead.y
        dy_down = chin.y - nose.y
        
        head_pose = "CENTER"
        
        # Thresholds (can be tuned)
        if dx_left > 0 and dx_right > 0:
            if dx_left / dx_right < 0.4:
                head_pose = "LOOKING_RIGHT" # Student looking to their left (image right)
            elif dx_right / dx_left < 0.4:
                head_pose = "LOOKING_LEFT"  # Student looking to their right (image left)
        
        if head_pose == "CENTER":
            if dy_up > 0 and dy_down > 0:
                if dy_up / dy_down < 0.6:
                    head_pose = "LOOKING_UP"
                elif dy_down / dy_up < 0.6:
                    head_pose = "LOOKING_DOWN"
                    
        metadata["head_pose"] = head_pose
        
        # Optional: log head movement if they are not looking center
        # For now, we will create an event if they look away to track it
        if head_pose != "CENTER":
            # Just tracking this as an event for analysis, as requested "add 4 point left right up and down"
            event_type = "HEAD_MOVEMENT"
            description = f"Student is {head_pose.replace('_', ' ').lower()}."
            save_evidence = True

    snapshot_url = None
    if save_evidence:
        # Save image to disk
        filename = f"{uuid.uuid4()}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        cv2.imwrite(filepath, img)
        snapshot_url = f"/uploads/proctoring/{filename}"
        
        # Log to MongoDB
        mongo_db = get_mongo_db()
        event = {
            "event_id": str(uuid.uuid4()),
            "eventType": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": {
                "description": description,
                "duration_seconds": duration_seconds,
                "snapshot_url": snapshot_url,
                "metadata": metadata
            }
        }
        
        # Upsert document for this attempt
        mongo_db.proctoring_events.update_one(
            {"attempt_id": attempt_id},
            {
                "$setOnInsert": {"attempt_id": attempt_id, "exam_id": exam_id, "student_id": student_id},
                "$push": {"events": event}
            },
            upsert=True
        )

    return {
        "status": "success",
        "face_count": face_count,
        "event_created": bool(event_type),
        "event_type": event_type,
        "metadata": metadata
    }
