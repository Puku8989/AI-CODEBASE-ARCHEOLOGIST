import uuid
from typing import Optional
from sqlalchemy import String, Integer, Text, ForeignKey, Index, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class SymbolRecord(Base):
    __tablename__ = "symbols"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    file_id: Mapped[str] = mapped_column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    parent_symbol_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("symbols.id", ondelete="SET NULL"), nullable=True)
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    qualified_name: Mapped[str] = mapped_column(String(512), nullable=False)  # e.g., AuthService.authenticate
    symbol_type: Mapped[str] = mapped_column(String(50), nullable=False)  # module, class, function, method, variable, api_route, model
    
    start_line: Mapped[int] = mapped_column(Integer, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, nullable=False)
    start_col: Mapped[int] = mapped_column(Integer, default=0)
    end_col: Mapped[int] = mapped_column(Integer, default=0)
    
    docstring: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    signature: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cyclomatic_complexity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    raw_source: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Flags
    is_async: Mapped[bool] = mapped_column(Boolean, default=False)
    is_exported: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    repository = relationship("Repository", back_populates="symbols")
    file = relationship("FileRecord", back_populates="symbols")
    children = relationship("SymbolRecord", backref="parent", remote_side=[id])
    outgoing_calls = relationship("FunctionCallRecord", back_populates="caller_symbol", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_symbols_repo_name", "repository_id", "name"),
        Index("idx_symbols_repo_type", "repository_id", "symbol_type"),
        Index("idx_symbols_file_id", "file_id"),
    )


class ImportRecord(Base):
    __tablename__ = "imports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    file_id: Mapped[str] = mapped_column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    
    source_module: Mapped[str] = mapped_column(String(512), nullable=False)  # e.g. fastapi, .database, os.path
    imported_name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. FastAPI, get_db, *
    alias: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_from_import: Mapped[bool] = mapped_column(Boolean, default=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    repository = relationship("Repository", back_populates="imports")
    file = relationship("FileRecord", back_populates="imports")

    __table_args__ = (
        Index("idx_imports_repo_source", "repository_id", "source_module"),
        Index("idx_imports_file_id", "file_id"),
    )


class FunctionCallRecord(Base):
    __tablename__ = "function_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    caller_symbol_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("symbols.id", ondelete="CASCADE"), nullable=True)
    file_id: Mapped[str] = mapped_column(String(36), ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    
    callee_name: Mapped[str] = mapped_column(String(512), nullable=False)  # e.g. authenticate, db.commit
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[str] = mapped_column(String(20), default="deterministic")  # deterministic, inferred

    # Relationships
    repository = relationship("Repository", back_populates="function_calls")
    caller_symbol = relationship("SymbolRecord", back_populates="outgoing_calls")

    __table_args__ = (
        Index("idx_calls_repo_callee", "repository_id", "callee_name"),
        Index("idx_calls_caller", "caller_symbol_id"),
    )


class ClassInheritanceRecord(Base):
    __tablename__ = "class_inheritances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    child_symbol_id: Mapped[str] = mapped_column(String(36), ForeignKey("symbols.id", ondelete="CASCADE"), nullable=False)
    parent_class_name: Mapped[str] = mapped_column(String(255), nullable=False)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("idx_inh_repo_child", "repository_id", "child_symbol_id"),
    )
