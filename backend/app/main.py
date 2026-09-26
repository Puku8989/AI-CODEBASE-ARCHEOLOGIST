from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.api.router import api_router

STATIC_DIR = Path(__file__).parent / "static"


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


# Mount API Router (support /api and /api/v1)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
if settings.API_V1_PREFIX != "/api/v1":
    app.include_router(api_router, prefix="/api/v1")



# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Mount Static Assets & Dist Assets
DIST_DIR = STATIC_DIR / "dist"
DIST_ASSETS_DIR = DIST_DIR / "assets"

if DIST_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_ASSETS_DIR)), name="assets")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# Serve Web Console SPA (React/Vite app with fallback)
@app.get("/")
def root():
    dist_index = DIST_DIR / "index.html"
    if dist_index.exists():
        return FileResponse(str(dist_index))
    legacy_index = STATIC_DIR / "index.html"
    if legacy_index.exists():
        return FileResponse(str(legacy_index))
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "docs": "/docs"
    }

