from fastapi import APIRouter
from app.api.repositories import router as repositories_router
from app.api.files import router as files_router
from app.api.symbols import router as symbols_router

api_router = APIRouter()

api_router.include_router(repositories_router)
api_router.include_router(files_router)
api_router.include_router(symbols_router)
