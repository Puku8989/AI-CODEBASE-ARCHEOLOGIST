from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class RepositoryCreate(BaseModel):
    name: Optional[str] = Field(None, description="Optional custom name for repository")
    url: Optional[str] = Field(None, description="Public GitHub repository URL")
    local_path: Optional[str] = Field(None, description="Local folder path if ingesting existing local repo")


class AnalysisRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    repository_id: str
    status: str
    progress_pct: int
    current_step: str
    total_files: int
    scanned_files: int
    parsed_files: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None


class RepositoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    url: Optional[str] = None
    local_path: str
    default_branch: str
    commit_hash: Optional[str] = None
    detected_languages: Optional[Dict[str, Any]] = None
    total_files: int
    total_lines: int
    total_symbols: int
    created_at: datetime
    updated_at: datetime
    latest_analysis: Optional[AnalysisRunResponse] = None


class RepositorySummary(BaseModel):
    id: str
    name: str
    url: Optional[str] = None
    total_files: int
    total_lines: int
    total_symbols: int
    created_at: datetime
    status: str
    progress_pct: int
