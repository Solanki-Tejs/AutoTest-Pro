import os
from pathlib import Path
from dotenv import load_dotenv
import urllib.parse

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

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

    # MONGODB CONFIGURATION
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    MONGO_DB = os.getenv("MONGO_DB", "autotest_pro")

    # LLM CONFIGURATION (gemini or local/ollama)
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower().strip()
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY").strip()
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()

    # OLLAMA CONFIGURATION
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "mistral:7b").strip()
    OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text:latest").strip()

settings = Settings()