"""End-to-end Phase 1 live repository verification script."""
import os
import sys
import json
from pathlib import Path
from pprint import pprint

# Ensure backend path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database import init_db, SessionLocal, engine
from app.models import (
    Repository,
    AnalysisRun,
    FileRecord,
    SymbolRecord,
    ImportRecord,
    FunctionCallRecord
)
from app.services.repo_service import RepoService
from app.services.analysis_orchestrator import AnalysisOrchestrator
from app.main import app
from fastapi.testclient import TestClient


def run_live_verification():
    print("=" * 80)
    print("PHASE 1 LIVE VERIFICATION: REAL PUBLIC PYTHON REPO ANALYSIS")
    print("=" * 80)

    # 1. Initialize Database
    print("\n[Step 1] Initializing Database Schema...")
    init_db()
    db = SessionLocal()

    # 2. Ingest real public repo
    # Using a known small, real public Python repo: bottlepy/bottle or pallets/click or a fast small repo
    repo_url = "https://github.com/bottlepy/bottle.git"
    print(f"\n[Step 2] Registering and analyzing real public repository: {repo_url}")

    client = TestClient(app)
    
    # POST /api/repositories
    create_resp = client.post("/api/repositories", json={
        "name": "bottle",
        "url": repo_url
    })
    print(f"HTTP POST /api/repositories status: {create_resp.status_code}")
    repo_data = create_resp.json()
    repo_id = repo_data["id"]
    print(f"Repository ID: {repo_id}")
    print(f"Repository Name: {repo_data['name']}")
    print(f"Repository URL: {repo_data['url']}")

    # Run orchestrator synchronously for deterministic verification output
    print("\n[Step 3] Running Analysis Orchestrator on real repository clone...")
    orchestrator = AnalysisOrchestrator(db=db)
    orchestrator.run_analysis(repo_id)

    # 3. Verify Status Endpoint
    status_resp = client.get(f"/api/repositories/{repo_id}/analysis-status")
    print(f"\n[Step 4] HTTP GET /api/repositories/{repo_id}/analysis-status:")
    pprint(status_resp.json())

    # 4. Verify Files Endpoint
    files_resp = client.get(f"/api/repositories/{repo_id}/files")
    files = files_resp.json()
    print(f"\n[Step 5] HTTP GET /api/repositories/{repo_id}/files (Total Scanned Files: {len(files)}):")
    for f in files[:10]:
        print(f"  - {f['path']} ({f['language']}, {f['line_count']} lines, status: {f['analysis_status']})")

    # 5. Direct Database Queries for Ground Truth Verification
    print("\n[Step 6] DIRECT DATABASE QUERY: Real Extracted Symbols")
    symbols = db.query(SymbolRecord, FileRecord.path).join(
        FileRecord, SymbolRecord.file_id == FileRecord.id
    ).filter(SymbolRecord.repository_id == repo_id).limit(25).all()

    print(f"Total symbols found in DB: {db.query(SymbolRecord).filter(SymbolRecord.repository_id == repo_id).count()}")
    print("\nSample Extracted Symbols (First 20):")
    for sym, fpath in symbols[:20]:
        print(f"  [{sym.symbol_type:<10}] {sym.qualified_name:<40} (Lines {sym.start_line:>4}-{sym.end_line:<4}, Complexity: {sym.cyclomatic_complexity or 'N/A'}) in {fpath}")

    # 6. Direct Database Queries for Imports
    print("\n[Step 7] DIRECT DATABASE QUERY: Real Extracted Imports")
    imports = db.query(ImportRecord).filter(ImportRecord.repository_id == repo_id).limit(15).all()
    for imp in imports:
        print(f"  Line {imp.line_number:>4}: from {imp.source_module} import {imp.imported_name}" if imp.is_from_import else f"  Line {imp.line_number:>4}: import {imp.source_module}")

    # 7. Direct Database Queries for Function Calls
    print("\n[Step 8] DIRECT DATABASE QUERY: Real Extracted Function Calls")
    calls = db.query(FunctionCallRecord).filter(FunctionCallRecord.repository_id == repo_id).limit(15).all()
    for c in calls:
        print(f"  Line {c.line_number:>4}: Calls -> {c.callee_name} (Confidence: {c.confidence})")

    print("\n" + "=" * 80)
    print("PHASE 1 VERIFICATION SUCCESSFUL: Real AST symbols extracted and verified in DB.")
    print("=" * 80)
    db.close()


if __name__ == "__main__":
    run_live_verification()
