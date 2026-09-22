import pymongo
from pymongo import IndexModel, ASCENDING
from pymongo.errors import ConnectionFailure

from core.config import settings

# Initialize synchronous PyMongo client
client = pymongo.MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[settings.MONGO_DB]
syllabus_topic_mapping_collection = db["syllabus_topic_mapping"]

def init_mongo():
    try:
        # Test connection
        client.admin.command('ping')
        print("Connected to MongoDB successfully.")
        
        # Create unique index on uploaded_syllabus_id
        index = IndexModel([("uploaded_syllabus_id", ASCENDING)], unique=True)
        syllabus_topic_mapping_collection.create_indexes([index])

        # Indexes for exam blueprints
        db.exam_question_blueprint.create_index([("exam_id", ASCENDING)], unique=True)

        # Indexes for question bank
        db.question_bank.create_index([("exam_id", ASCENDING)])
        db.question_bank.create_index([("exam_id", ASCENDING), ("is_active", ASCENDING)])

        print("MongoDB indexes created successfully.")
    except ConnectionFailure:
        print("Failed to connect to MongoDB.")
    except Exception as e:
        print(f"An error occurred while initializing MongoDB: {e}")

def get_mongo_db():
    return db
