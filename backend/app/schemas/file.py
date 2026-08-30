from typing import Optional
from pydantic import BaseModel, ConfigDict


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    repository_id: str
    path: str
    filename: str
    extension: str
    language: str
    size_bytes: int
    line_count: int
    analysis_status: str
    error_detail: Optional[str] = None


class FileContentResponse(BaseModel):
    id: str
    path: str
    filename: str
    language: str
    line_count: int
    content: str
