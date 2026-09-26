from fastapi.testclient import TestClient
from app.services.analysis_orchestrator import AnalysisOrchestrator


def test_create_and_analyze_repository(client: TestClient, sample_repo_path, db_session):
    # 1. Create Repository via local_path
    resp = client.post("/api/repositories", json={
        "name": "Sample Python Test Repo",
        "local_path": str(sample_repo_path)
    })
    assert resp.status_code == 201
    data = resp.json()
    repo_id = data["id"]
    assert data["name"] == "Sample Python Test Repo"

    # Run analysis synchronously for test
    orchestrator = AnalysisOrchestrator(db=db_session)
    orchestrator.run_analysis(repo_id)

    # 2. Check Analysis Status
    status_resp = client.get(f"/api/repositories/{repo_id}/analysis-status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["status"] == "COMPLETED"
    assert status_data["progress_pct"] == 100
    assert status_data["total_files"] >= 5

    # 3. Check Files API
    files_resp = client.get(f"/api/repositories/{repo_id}/files")
    assert files_resp.status_code == 200
    files_data = files_resp.json()
    assert len(files_data) >= 5
    file_paths = [f["path"] for f in files_data]
    assert any("models/user.py" in p for p in file_paths)

    # Check Single File Content
    user_file = next(f for f in files_data if "models/user.py" in f["path"])
    content_resp = client.get(f"/api/repositories/{repo_id}/files/{user_file['id']}")
    assert content_resp.status_code == 200
    assert "class User" in content_resp.json()["content"]

    # 4. Check Symbols API
    symbols_resp = client.get(f"/api/repositories/{repo_id}/symbols")
    assert symbols_resp.status_code == 200
    symbols = symbols_resp.json()
    assert len(symbols) >= 8

    symbol_names = [s["name"] for s in symbols]
    assert "User" in symbol_names
    assert "AuthService" in symbol_names
    assert "authenticate_user" in symbol_names
    assert "TokenService" in symbol_names
    assert "login_endpoint" in symbol_names

    # Filter by symbol_type
    class_syms = client.get(f"/api/repositories/{repo_id}/symbols?symbol_type=class").json()
    assert all(s["symbol_type"] == "class" for s in class_syms)

    # 5. Check Delete Repository
    del_resp = client.delete(f"/api/repositories/{repo_id}")
    assert del_resp.status_code == 200


def test_invalid_repo_url_rejected(client: TestClient):
    resp = client.post("/api/repositories", json={
        "url": "file:///etc/passwd"
    })
    assert resp.status_code == 400
    assert "Invalid repository URL" in resp.json()["detail"]


def test_web_console_served_at_root(client: TestClient):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "AI Codebase Archaeologist" in resp.text
    assert "Ingest Codebase" in resp.text

