from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SymbolRecord, ImportRecord, FunctionCallRecord, FileRecord
from app.schemas.symbol import SymbolResponse, ImportResponse, FunctionCallResponse

router = APIRouter(prefix="/repositories/{repo_id}", tags=["symbols"])


@router.get("/symbols", response_model=List[SymbolResponse])
def list_symbols(
    repo_id: str,
    symbol_type: Optional[str] = Query(None, description="Filter by type: class, function, method, model, api_route, variable"),
    file_id: Optional[str] = Query(None, description="Filter by specific file ID"),
    q: Optional[str] = Query(None, description="Search symbol by name or qualified name"),
    db: Session = Depends(get_db)
):
    """List extracted AST symbols for a repository with flexible filtering."""
    query = db.query(SymbolRecord, FileRecord.path.label("file_path")).join(
        FileRecord, SymbolRecord.file_id == FileRecord.id
    ).filter(SymbolRecord.repository_id == repo_id)

    if symbol_type:
        query = query.filter(SymbolRecord.symbol_type == symbol_type)
    if file_id:
        query = query.filter(SymbolRecord.file_id == file_id)
    if q:
        query = query.filter(
            (SymbolRecord.name.ilike(f"%{q}%")) | (SymbolRecord.qualified_name.ilike(f"%{q}%"))
        )

    rows = query.order_by(FileRecord.path.asc(), SymbolRecord.start_line.asc()).all()
    
    results = []
    for sym, file_path in rows:
        res = SymbolResponse.model_validate(sym)
        res.file_path = file_path
        results.append(res)
    return results


@router.get("/imports", response_model=List[ImportResponse])
def list_imports(
    repo_id: str,
    file_id: Optional[str] = Query(None, description="Filter by file ID"),
    source_module: Optional[str] = Query(None, description="Filter by source module"),
    db: Session = Depends(get_db)
):
    """List all extracted module and symbol imports."""
    query = db.query(ImportRecord).filter(ImportRecord.repository_id == repo_id)
    
    if file_id:
        query = query.filter(ImportRecord.file_id == file_id)
    if source_module:
        query = query.filter(ImportRecord.source_module.ilike(f"%{source_module}%"))

    imports = query.order_by(ImportRecord.line_number.asc()).all()
    return [ImportResponse.model_validate(imp) for imp in imports]


@router.get("/calls", response_model=List[FunctionCallResponse])
def list_function_calls(
    repo_id: str,
    file_id: Optional[str] = Query(None, description="Filter by file ID"),
    caller_symbol_id: Optional[str] = Query(None, description="Filter by caller symbol ID"),
    callee_name: Optional[str] = Query(None, description="Filter by callee function name"),
    db: Session = Depends(get_db)
):
    """List function and method calls extracted from code."""
    query = db.query(FunctionCallRecord).filter(FunctionCallRecord.repository_id == repo_id)
    
    if file_id:
        query = query.filter(FunctionCallRecord.file_id == file_id)
    if caller_symbol_id:
        query = query.filter(FunctionCallRecord.caller_symbol_id == caller_symbol_id)
    if callee_name:
        query = query.filter(FunctionCallRecord.callee_name.ilike(f"%{callee_name}%"))

    calls = query.order_by(FunctionCallRecord.line_number.asc()).all()
    return [FunctionCallResponse.model_validate(c) for c in calls]
