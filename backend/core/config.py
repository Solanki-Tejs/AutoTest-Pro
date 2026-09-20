import os
from pathlib import Path
from dotenv import load_dotenv
import urllib.parse

# Load backend/.env deterministically
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
load_dotenv()


class Settings:
    # DB CONFIGURATION
    DB_USER=os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT")
    DB_NAME = os.getenv("DB_NAME")   
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

    # JWT CONFIGURATION
    SECRET_KEY = os.getenv("SECRET_KEY")
    ALGORITHM = os.getenv("ALGORITHM")
    # ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

    # REDIS CONFIGURATION
    REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

    # MONGODB CONFIGURATION (Reserved for question bank)
    MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    MONGODB_DATABASE = os.getenv("DB_NAME", "autotestpro")

    # OLLAMA CONFIGURATION
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest")
    OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llava:7b")
    OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "mistral:7b")
    EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "768"))

settings = Settings()