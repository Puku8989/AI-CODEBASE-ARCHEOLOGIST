from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Repository, AnalysisRun
from app.schemas.repository import (
    RepositoryCreate,
    RepositoryResponse,
    AnalysisRunResponse,
    RepositorySummary
)
from app.services.repo_service import RepoService, validate_repo_url, extract_repo_name
from app.services.analysis_orchestrator import AnalysisOrchestrator

router = APIRouter(prefix="/repositories", tags=["repositories"])


def run_orchestrator_job(repository_id: str):
    orchestrator = AnalysisOrchestrator()
    orchestrator.run_analysis(repository_id)


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
def create_repository(
    payload: RepositoryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Register a new repository via GitHub URL or local path and automatically schedule analysis."""
    if not payload.url and not payload.local_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'url' (GitHub URL) or 'local_path' must be provided."
        )

    if payload.url and not validate_repo_url(payload.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid repository URL: {payload.url}. Must be a valid GitHub/Git repository URL."
        )

    repo_name = payload.name or extract_repo_name(payload.url, payload.local_path)
    
    # Check if exists
    existing = None
    if payload.url:
        existing = db.query(Repository).filter(Repository.url == payload.url).first()
    elif payload.local_path:
        existing = db.query(Repository).filter(Repository.local_path == payload.local_path).first()

    if existing:
        # Re-trigger analysis on existing
        run = AnalysisRun(repository_id=existing.id, status="QUEUED", current_step="Analysis queued")
        db.add(run)
        db.commit()
        background_tasks.add_task(run_orchestrator_job, existing.id)
        
        # Populate latest_analysis
        res = RepositoryResponse.model_validate(existing)
        res.latest_analysis = AnalysisRunResponse.model_validate(run)
        return res

    # Create new repository record
    target_local_path = payload.local_path or ""
    repo = Repository(
        name=repo_name,
        url=payload.url,
        local_path=target_local_path,
        default_branch="main"
    )
    db.add(repo)
    db.flush()

    # If local path provided, copy to storage
    if payload.local_path:
        storage_dir = RepoService.prepare_repo_storage(repo.id)
        branch, commit = RepoService.copy_local_repository(payload.local_path, storage_dir)
        repo.local_path = str(storage_dir)
        repo.default_branch = branch
        repo.commit_hash = commit
    else:
        # Reserve storage path for clone
        repo.local_path = str(RepoService.prepare_repo_storage(repo.id))

    # Create initial queued run
    run = AnalysisRun(
        repository_id=repo.id,
        status="QUEUED",
        current_step="Analysis queued"
    )
    db.add(run)
    db.commit()
    db.refresh(repo)
    db.refresh(run)

    # Trigger background analysis
    background_tasks.add_task(run_orchestrator_job, repo.id)

    response = RepositoryResponse.model_validate(repo)
    response.latest_analysis = AnalysisRunResponse.model_validate(run)
    return response


@router.get("", response_model=List[RepositoryResponse])
def list_repositories(db: Session = Depends(get_db)):
    """List all ingested repositories with their latest analysis status."""
    repos = db.query(Repository).order_by(Repository.created_at.desc()).all()
    results = []
    for repo in repos:
        res = RepositoryResponse.model_validate(repo)
        latest_run = db.query(AnalysisRun).filter(
            AnalysisRun.repository_id == repo.id
        ).order_by(AnalysisRun.started_at.desc()).first()
        if latest_run:
            res.latest_analysis = AnalysisRunResponse.model_validate(latest_run)
        results.append(res)
    return results


@router.get("/{repo_id}", response_model=RepositoryResponse)
def get_repository(repo_id: str, db: Session = Depends(get_db)):
    """Get single repository details."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")
    
    res = RepositoryResponse.model_validate(repo)
    latest_run = db.query(AnalysisRun).filter(
        AnalysisRun.repository_id == repo.id
    ).order_by(AnalysisRun.started_at.desc()).first()
    if latest_run:
        res.latest_analysis = AnalysisRunResponse.model_validate(latest_run)
    return res


@router.delete("/{repo_id}", status_code=status.HTTP_200_OK)
def delete_repository(repo_id: str, db: Session = Depends(get_db)):
    """Delete repository, its database artifacts, and stored source clone."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    RepoService.delete_repo_storage(repo.id)
    db.delete(repo)
    db.commit()
    return {"message": f"Repository '{repo.name}' ({repo_id}) successfully deleted."}


@router.post("/{repo_id}/analyze", response_model=AnalysisRunResponse)
def trigger_analysis(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Trigger a new analysis pass for a repository."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    run = AnalysisRun(
        repository_id=repo.id,
        status="QUEUED",
        current_step="Analysis queued"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(run_orchestrator_job, repo.id)
    return AnalysisRunResponse.model_validate(run)


@router.get("/{repo_id}/analysis-status", response_model=AnalysisRunResponse)
def get_analysis_status(repo_id: str, db: Session = Depends(get_db)):
    """Poll the latest analysis run status and progress percentage."""
    run = db.query(AnalysisRun).filter(
        AnalysisRun.repository_id == repo_id
    ).order_by(AnalysisRun.started_at.desc()).first()

    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No analysis run found for repository.")

    return AnalysisRunResponse.model_validate(run)
