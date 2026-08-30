import uuid
from typing import Optional
from sqlalchemy import String, Integer, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class FileRecord(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    
    path: Mapped[str] = mapped_column(String(1024), nullable=False)  # relative path (e.g. app/core/auth.py)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    extension: Mapped[str] = mapped_column(String(50), default="")
    language: Mapped[str] = mapped_column(String(50), default="unknown")  # python, javascript, typescript, unsupported
    
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    line_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Status: analyzed, unsupported, failed, skipped
    analysis_status: Mapped[str] = mapped_column(String(50), default="unsupported")
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    repository = relationship("Repository", back_populates="files")
    symbols = relationship("SymbolRecord", back_populates="file", cascade="all, delete-orphan")
    imports = relationship("ImportRecord", back_populates="file", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_files_repo_path", "repository_id", "path"),
        Index("idx_files_repo_lang", "repository_id", "language"),
    )
