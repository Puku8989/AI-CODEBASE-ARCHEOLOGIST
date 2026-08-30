from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class SymbolResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    repository_id: str
    file_id: str
    file_path: Optional[str] = None
    parent_symbol_id: Optional[str] = None
    name: str
    qualified_name: str
    symbol_type: str
    start_line: int
    end_line: int
    start_col: int
    end_col: int
    docstring: Optional[str] = None
    signature: Optional[str] = None
    cyclomatic_complexity: Optional[int] = None
    raw_source: Optional[str] = None
    is_async: bool = False
    is_exported: bool = True


class ImportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    source_module: str
    imported_name: str
    alias: Optional[str] = None
    is_from_import: bool
    line_number: int


class FunctionCallResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    caller_symbol_id: Optional[str] = None
    file_id: str
    callee_name: str
    line_number: int
    confidence: str
