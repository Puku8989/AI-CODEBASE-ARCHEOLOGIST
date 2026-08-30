import uuid
from typing import Optional
from sqlalchemy import String, ForeignKey, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class GraphEdgeRecord(Base):
    __tablename__ = "graph_edges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    repository_id: Mapped[str] = mapped_column(String(36), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    
    # Relationship type: imports, depends_on, inherits, calls, invokes, accesses
    relationship_type: Mapped[str] = mapped_column(String(50), nullable=False)
    
    source_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # file, module, class, function, api, model
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    target_id: Mapped[str] = mapped_column(String(255), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Confidence: deterministic vs inferred
    confidence: Mapped[str] = mapped_column(String(20), default="deterministic")
    edge_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)

    repository = relationship("Repository", back_populates="graph_edges")

    __table_args__ = (
        Index("idx_edges_repo_rel", "repository_id", "relationship_type"),
        Index("idx_edges_repo_source", "repository_id", "source_id"),
        Index("idx_edges_repo_target", "repository_id", "target_id"),
    )
