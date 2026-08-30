from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Repository, FileRecord
from app.schemas.file import FileResponse, FileContentResponse

router = APIRouter(prefix="/repositories/{repo_id}/files", tags=["files"])


@router.get("", response_model=List[FileResponse])
def list_files(
    repo_id: str,
    language: Optional[str] = Query(None, description="Filter by language"),
    analysis_status: Optional[str] = Query(None, description="Filter by analysis status"),
    db: Session = Depends(get_db)
):
    """List all scanned files in the repository."""
    query = db.query(FileRecord).filter(FileRecord.repository_id == repo_id)
    
    if language:
        query = query.filter(FileRecord.language == language)
    if analysis_status:
        query = query.filter(FileRecord.analysis_status == analysis_status)

    files = query.order_by(FileRecord.path.asc()).all()
    return [FileResponse.model_validate(f) for f in files]


@router.get("/{file_id}", response_model=FileContentResponse)
def get_file_content(repo_id: str, file_id: str, db: Session = Depends(get_db)):
    """Retrieve metadata and raw content of a specific file."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    file_rec = db.query(FileRecord).filter(
        FileRecord.id == file_id,
        FileRecord.repository_id == repo_id
    ).first()

    if not file_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # Read content from filesystem
    full_path = Path(repo.local_path) / file_rec.path
    content = ""
    if full_path.exists() and full_path.is_file():
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception as e:
            content = f"Error reading file content: {str(e)}"
    else:
        content = "File not found on local disk storage."

    return FileContentResponse(
        id=file_rec.id,
        path=file_rec.path,
        filename=file_rec.filename,
        language=file_rec.language,
        line_count=file_rec.line_count,
        content=content
    )
