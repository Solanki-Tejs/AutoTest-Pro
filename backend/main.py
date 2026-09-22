from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, health, classes, syllabus, topics
from databases.mongo import init_mongo

app = FastAPI(
    title="AutoTest Pro API",
    description="Authentication and role-based access backend for AutoTest Pro",
    version="1.0.0",
)

@app.on_event("startup")
def on_startup():
    init_mongo()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(classes.router, prefix="/api/classes", tags=["Classes"])
app.include_router(syllabus.router, prefix="/api", tags=["Syllabus"])
app.include_router(topics.router, prefix="/api", tags=["Topics"])

from routes import exams
app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])


@app.get("/")
async def root():
    return {
        "message": "AutoTest Pro API",
    }
