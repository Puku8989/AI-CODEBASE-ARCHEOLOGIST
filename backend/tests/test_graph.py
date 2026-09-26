from fastapi.testclient import TestClient
from app.services.analysis_orchestrator import AnalysisOrchestrator


def test_graph_construction_and_cycles_python(client: TestClient, sample_repo_path, db_session):
    # Ingest Python Repo
    resp = client.post("/api/repositories", json={
        "name": "Python Graph Fixture",
        "local_path": str(sample_repo_path)
    })
    assert resp.status_code == 201
    repo_id = resp.json()["id"]

    # Run full analysis
    orchestrator = AnalysisOrchestrator(db=db_session)
    orchestrator.run_analysis(repo_id)

    # 1. Test Architecture Graph Endpoint
    graph_resp = client.get(f"/api/repositories/{repo_id}/graph?view_mode=all")
    assert graph_resp.status_code == 200
    graph_data = graph_resp.json()
    assert len(graph_data["nodes"]) >= 5
    assert len(graph_data["edges"]) >= 3
    assert graph_data["stats"]["totalNodes"] == len(graph_data["nodes"])
    assert graph_data["stats"]["circularDependencyCount"] >= 1

    # Check View Modes
    func_graph = client.get(f"/api/repositories/{repo_id}/graph?view_mode=functions").json()
    assert all(n["data"]["node_type"] in ("function", "method", "api_route") for n in func_graph["nodes"])

    # 2. Test Circular Dependency Detection
    cycles_resp = client.get(f"/api/repositories/{repo_id}/cycles")
    assert cycles_resp.status_code == 200
    cycles_data = cycles_resp.json()
    assert cycles_data["total_cycles"] >= 1
    
    # Check that auth_service <-> token_service circular loop is detected
    found_auth_token_cycle = False
    for cycle in cycles_data["cycles"]:
        paths = [step["path"] for step in cycle]
        if any("auth_service" in p for p in paths) and any("token_service" in p for p in paths):
            found_auth_token_cycle = True
            break
    assert found_auth_token_cycle is True

    # 3. Test Coupling Metrics
    coupling_resp = client.get(f"/api/repositories/{repo_id}/coupling")
    assert coupling_resp.status_code == 200
    modules = coupling_resp.json()["modules"]
    assert len(modules) >= 3
    assert any("instability" in m for m in modules)

    # 4. Test Node Details Endpoint
    first_node_id = graph_data["nodes"][0]["id"]
    details_resp = client.get(f"/api/repositories/{repo_id}/nodes/{first_node_id}/details")
    assert details_resp.status_code == 200
    details = details_resp.json()
    assert details["node_id"] == first_node_id
    assert "incoming" in details
    assert "outgoing" in details


def test_graph_construction_and_cycles_typescript(client: TestClient, sample_js_repo_path, db_session):
    # Ingest JS/TS Repo
    resp = client.post("/api/repositories", json={
        "name": "TypeScript Graph Fixture",
        "local_path": str(sample_js_repo_path)
    })
    assert resp.status_code == 201
    repo_id = resp.json()["id"]

    # Run analysis
    orchestrator = AnalysisOrchestrator(db=db_session)
    orchestrator.run_analysis(repo_id)

    # Verify status
    status_resp = client.get(f"/api/repositories/{repo_id}/analysis-status").json()
    assert status_resp["status"] == "COMPLETED"
    assert status_resp["parsed_files"] >= 5

    # Check Graph
    graph_resp = client.get(f"/api/repositories/{repo_id}/graph")
    assert graph_resp.status_code == 200
    graph_data = graph_resp.json()
    assert len(graph_data["nodes"]) >= 8

    # Check TS Cycles
    cycles_resp = client.get(f"/api/repositories/{repo_id}/cycles").json()
    assert cycles_resp["total_cycles"] >= 1
    found_ts_cycle = False
    for cycle in cycles_resp["cycles"]:
        paths = [step["path"] for step in cycle]
        if any("auth.service" in p for p in paths) and any("token.service" in p for p in paths):
            found_ts_cycle = True
            break
    assert found_ts_cycle is True


def test_graph_analyzer_enhancements(client: TestClient, sample_repo_path, db_session):
    resp = client.post("/api/repositories", json={
        "name": "Enhancements Test Repo",
        "local_path": str(sample_repo_path)
    })
    assert resp.status_code == 201
    repo_id = resp.json()["id"]

    orchestrator = AnalysisOrchestrator(db=db_session)
    orchestrator.run_analysis(repo_id)

    # Test Architecture View with enhanced fields
    graph_resp = client.get(f"/api/repositories/{repo_id}/graph?view_mode=architecture")
    assert graph_resp.status_code == 200
    data = graph_resp.json()

    assert "entryPoints" in data
    assert isinstance(data["entryPoints"], list)
    assert "directoryGroups" in data
    assert isinstance(data["directoryGroups"], dict)

    # Check node enrichment
    for node in data["nodes"]:
        ndata = node["data"]
        assert "importance" in ndata
        assert "directory" in ndata

    # Check edge enrichment and color mapping
    for edge in data["edges"]:
        edata = edge["data"]
        assert "relationshipType" in edata
        assert "confidence" in edata
        assert "markerEnd" not in edge or edge["markerEnd"] is not None

