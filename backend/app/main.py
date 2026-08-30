from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import init_db
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schemas on startup
    init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI Codebase Archaeologist - Autonomous Code Knowledge Extraction & RAG Engine",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "detail": str(exc),
            "path": str(request.url)
        }
    )


# Health checks
@app.get("/")
def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Mount API Router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
