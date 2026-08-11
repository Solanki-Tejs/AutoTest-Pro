from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, health

app = FastAPI(
    title="AutoTest Pro API",
    description="Authentication and role-based access backend for AutoTest Pro",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])


@app.get("/")
async def root():
    return {
        "message": "AutoTest Pro API",
    }
