from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Repository
from app.graph.graph_builder import GraphBuilder
from app.graph.graph_analyzer import GraphAnalyzer

router = APIRouter(prefix="/repositories/{repo_id}", tags=["graph"])


def _get_analyzer(repo_id: str, db: Session) -> GraphAnalyzer:
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    builder = GraphBuilder(db, repo)
    builder._load_entities()
    builder._build_nodes()
    builder._build_import_edges()
    builder._build_call_edges()
    builder._build_inheritance_edges()
    builder._build_api_and_model_edges()
    
    return GraphAnalyzer(builder.graph)


@router.get("/graph")
def get_architecture_graph(
    repo_id: str,
    view_mode: str = Query("all", description="View mode: all, architecture, modules, functions, apis, classes"),
    confidence: Optional[str] = Query(None, description="Filter edge confidence: deterministic, inferred"),
    db: Session = Depends(get_db)
):
    """Retrieve full or filtered interactive architecture graph formatted for React Flow."""
    analyzer = _get_analyzer(repo_id, db)
    return analyzer.format_react_flow_payload(
        view_mode=view_mode,
        confidence_filter=confidence
    )


@router.get("/cycles")
def get_circular_dependencies(repo_id: str, db: Session = Depends(get_db)):
    """Retrieve detected circular dependency cycles across files and modules."""
    analyzer = _get_analyzer(repo_id, db)
    cycles = analyzer.find_circular_dependencies()
    return {
        "repository_id": repo_id,
        "total_cycles": len(cycles),
        "cycles": cycles
    }


@router.get("/coupling")
def get_module_coupling(repo_id: str, db: Session = Depends(get_db)):
    """Retrieve module coupling metrics (Afferent Ca, Efferent Ce, Instability I)."""
    analyzer = _get_analyzer(repo_id, db)
    metrics = analyzer.compute_coupling_metrics()
    return {
        "repository_id": repo_id,
        "modules": metrics
    }


@router.get("/nodes/{node_id}/details")
def get_node_details(repo_id: str, node_id: str, db: Session = Depends(get_db)):
    """Inspect detailed caller, callee, and dependency neighborhood for a single node."""
    analyzer = _get_analyzer(repo_id, db)
    details = analyzer.get_node_details(node_id)
    if "error" in details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=details["error"])
    return details
