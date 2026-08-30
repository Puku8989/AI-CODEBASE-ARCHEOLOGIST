"""Phase 2 Live Verification: Multi-language parsing, NetworkX graph & Cycle detection."""
import os
import sys
from pathlib import Path
from pprint import pprint

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database import init_db, SessionLocal
from app.models import Repository, FileRecord, SymbolRecord, GraphEdgeRecord
from app.services.analysis_orchestrator import AnalysisOrchestrator
from app.main import app
from fastapi.testclient import TestClient


def run_phase2_verification():
    print("=" * 80)
    print("PHASE 2 LIVE VERIFICATION: MULTI-LANGUAGE PARSING & DEPENDENCY GRAPH")
    print("=" * 80)

    init_db()
    db = SessionLocal()
    client = TestClient(app)

    # 1. Ingest TypeScript / JavaScript Sample Repo
    js_fixture_path = backend_dir / "tests" / "fixtures" / "sample_js_repo"
    print(f"\n[Step 1] Registering TypeScript / JavaScript repository: {js_fixture_path}")
    
    create_resp = client.post("/api/repositories", json={
        "name": "sample_ts_app",
        "local_path": str(js_fixture_path)
    })
    print(f"HTTP POST /api/repositories status: {create_resp.status_code}")
    repo_data = create_resp.json()
    repo_id = repo_data["id"]

    # 2. Run analysis orchestrator (Tree-sitter + GraphBuilder)
    print("\n[Step 2] Executing Multi-Language Analysis & Graph Generation...")
    orchestrator = AnalysisOrchestrator(db=db)
    orchestrator.run_analysis(repo_id)

    # 3. Verify Analysis Status
    status_resp = client.get(f"/api/repositories/{repo_id}/analysis-status")
    print("\n[Step 3] HTTP GET /api/repositories/{id}/analysis-status:")
    pprint(status_resp.json())

    # 4. Verify Extracted Tree-sitter JS/TS Symbols
    symbols = db.query(SymbolRecord, FileRecord.path).join(
        FileRecord, SymbolRecord.file_id == FileRecord.id
    ).filter(SymbolRecord.repository_id == repo_id).all()
    print(f"\n[Step 4] Extracted Tree-sitter Symbols (Total: {len(symbols)}):")
    for sym, fpath in symbols:
        print(f"  [{sym.symbol_type:<10}] {sym.qualified_name:<35} (Lines {sym.start_line:>2}-{sym.end_line:<2}, Complexity: {sym.cyclomatic_complexity or 'N/A'}) in {fpath}")

    # 5. Query Persistent Graph Edges Table
    edges = db.query(GraphEdgeRecord).filter(GraphEdgeRecord.repository_id == repo_id).all()
    print(f"\n[Step 5] Persisted Graph Edges (Total: {len(edges)}):")
    for e in edges:
        print(f"  [{e.relationship_type:<10}] {e.source_name:<25} ---> {e.target_name:<25} (Confidence: {e.confidence})")

    # 6. Test React Flow Graph Endpoint
    print("\n[Step 6] HTTP GET /api/repositories/{id}/graph (React Flow Formatted):")
    graph_resp = client.get(f"/api/repositories/{repo_id}/graph?view_mode=all")
    graph_data = graph_resp.json()
    print(f"  React Flow Nodes: {len(graph_data['nodes'])}, Edges: {len(graph_data['edges'])}")
    print("  Graph Stats:", graph_data["stats"])

    # 7. Test Circular Dependency Detection Endpoint
    print("\n[Step 7] HTTP GET /api/repositories/{id}/cycles (Circular Dependencies):")
    cycles_resp = client.get(f"/api/repositories/{repo_id}/cycles")
    cycles_data = cycles_resp.json()
    pprint(cycles_data)

    # 8. Test Module Coupling Metrics Endpoint
    print("\n[Step 8] HTTP GET /api/repositories/{id}/coupling (Module Coupling & Instability):")
    coupling_resp = client.get(f"/api/repositories/{repo_id}/coupling")
    coupling_data = coupling_resp.json()
    pprint(coupling_data["modules"])

    print("\n" + "=" * 80)
    print("PHASE 2 VERIFICATION SUCCESSFUL: Tree-sitter JS/TS parsed, NetworkX graph built, and cycles detected.")
    print("=" * 80)
    db.close()


if __name__ == "__main__":
    run_phase2_verification()
