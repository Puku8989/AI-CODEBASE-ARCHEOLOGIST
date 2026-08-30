import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, DateTime, Integer, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    local_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    default_branch: Mapped[str] = mapped_column(String(100), default="main")
    commit_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    detected_languages: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    # Metadata stats
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    total_lines: Mapped[int] = mapped_column(Integer, default=0)
    total_symbols: Mapped[int] = mapped_column(Integer, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)

    # Relationships
    analysis_runs = relationship("AnalysisRun", back_populates="repository", cascade="all, delete-orphan")
    files = relationship("FileRecord", back_populates="repository", cascade="all, delete-orphan")
    symbols = relationship("SymbolRecord", back_populates="repository", cascade="all, delete-orphan")
    imports = relationship("ImportRecord", back_populates="repository", cascade="all, delete-orphan")
    function_calls = relationship("FunctionCallRecord", back_populates="repository", cascade="all, delete-orphan")
    graph_edges = relationship("GraphEdgeRecord", back_populates="repository", cascade="all, delete-orphan")


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    
    # Status: QUEUED, CLONING, SCANNING, PARSING, BUILDING_GRAPH, GENERATING_EMBEDDINGS, ANALYZING_GIT, COMPLETED, FAILED
    status: Mapped[str] = mapped_column(String(50), default="QUEUED")
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    current_step: Mapped[str] = mapped_column(String(255), default="Initializing...")
    
    total_files: Mapped[int] = mapped_column(Integer, default=0)
    scanned_files: Mapped[int] = mapped_column(Integer, default=0)
    parsed_files: Mapped[int] = mapped_column(Integer, default=0)
    
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    repository = relationship("Repository", back_populates="analysis_runs")
